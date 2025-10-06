// Using fetch for Anthropic API to avoid dependency conflicts
// import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import type { TechnicianFields, AirtableRecord } from './airtable';

// Direct API integration to avoid dependency conflicts
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

export interface JobDetails {
  location: string;
  scheduledDate: string;
  scheduledTime: string;
  jobType: string;
  subject: string;
  bodyPlain: string;
  techsNeeded?: string | null;
}

export interface TechnicianData {
  id: string;
  name: string;
  certifications: string[];
  status: string;
  availability?: Array<{
    periodType: string;
    startDate: string;
    endDate?: string;
    reason?: string;
  }>;
}

export interface TeamMember {
  technician: TechnicianData;
  confidenceScore: number;
  role: "Lead" | "Specialist" | "Support";
  reasoning: string[];
  availabilityStatus: string;
}

export interface AlternativeTechnician {
  technician: TechnicianData;
  confidenceScore: number;
  reasoning: string[];
  availabilityStatus: string;
}

export interface MatchAnalysis {
  teamComposition: {
    size: number;
    members: TeamMember[];
    teamDynamics?: string;
    coordinationPlan?: string;
  };
  alternatives: AlternativeTechnician[];
  jobAnalysis: {
    complexity: "simple" | "moderate" | "complex";
    requiredSkills: string[];
    estimatedDuration: string;
    recommendations: string[];
  };
  analysisTimestamp: string;
  fallbackUsed: boolean;
  
  // Backward compatibility
  topRecommendation: {
    technician: TechnicianData;
    confidenceScore: number;
    reasoning: string[];
    availabilityStatus: string;
  };
}

export class ClaudeMatchingService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!process.env.ANTHROPIC_API_KEY;
    if (!this.isConfigured) {
      logger.warn("Claude AI not configured - will use fallback matching logic");
    }
  }

  /**
   * Extract job requirements and skills needed from job description
   */
  async analyzeJobRequirements(jobDetails: JobDetails): Promise<{
    requiredSkills: string[];
    complexity: "simple" | "moderate" | "complex";
    estimatedDuration: string;
    recommendations: string[];
  }> {
    if (!this.isConfigured) {
      return this.fallbackJobAnalysis(jobDetails);
    }

    try {
      const prompt = `
Analyze this industrial job request and extract key requirements:

Job Type: ${jobDetails.jobType}
Location: ${jobDetails.location}
Date/Time: ${jobDetails.scheduledDate} at ${jobDetails.scheduledTime}
Subject: ${jobDetails.subject}
Description: ${jobDetails.bodyPlain}
Technicians Needed: ${jobDetails.techsNeeded || "Not specified"}

Please provide a JSON response with:
1. requiredSkills: Array of specific technical skills/certifications needed
2. complexity: "simple", "moderate", or "complex" 
3. estimatedDuration: Estimated time to complete (e.g., "2-4 hours", "Full day")
4. recommendations: Array of specific recommendations for successful completion

Focus on technical requirements like certifications (UT Level I/II, RT, MT, PT, VT), safety requirements (rope access, confined space), and equipment needs.
`;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();

      const content = data.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const analysis = JSON.parse(content.text);
      
      logger.info("Claude job analysis completed", {
        jobType: jobDetails.jobType,
        complexity: analysis.complexity,
        skillCount: analysis.requiredSkills?.length || 0
      });

      return {
        requiredSkills: analysis.requiredSkills || [],
        complexity: analysis.complexity || "moderate",
        estimatedDuration: analysis.estimatedDuration || "Half day",
        recommendations: analysis.recommendations || []
      };

    } catch (error) {
      logger.error("Claude job analysis failed, using fallback", { error });
      return this.fallbackJobAnalysis(jobDetails);
    }
  }

  /**
   * Rank technicians based on job requirements using AI analysis
   */
  async rankTechnicians(
    jobDetails: JobDetails,
    availableTechnicians: Array<{
      technician: AirtableRecord<TechnicianFields>;
      availability: any[];
      matchScore: number;
    }>
  ): Promise<TeamMember[]> {
    if (!this.isConfigured || availableTechnicians.length === 0) {
      return this.fallbackRanking(jobDetails, availableTechnicians);
    }

    try {
      const techniciansData = availableTechnicians.map(t => ({
        id: t.technician.id,
        name: t.technician.fields.Name,
        certifications: t.technician.fields["Technician Certifications"] || [],
        status: t.technician.fields.Status,
        availability: t.availability.map(a => ({
          periodType: a.fields["Period Type"],
          startDate: a.fields["Start Date"],
          endDate: a.fields["End Date"],
          reason: a.fields.Reason
        }))
      }));

      const prompt = `
Analyze and recommend technician staffing for this job:

Job Details:
- Type: ${jobDetails.jobType}
- Location: ${jobDetails.location}
- Date/Time: ${jobDetails.scheduledDate} at ${jobDetails.scheduledTime}
- Description: ${jobDetails.bodyPlain}
- Technicians Required: ${jobDetails.techsNeeded || 1}

Available Technicians:
${techniciansData.map(t => `
- ${t.name} (${t.status})
  Certifications: ${t.certifications.join(', ') || 'None listed'}
  Availability: ${t.availability.map(a => `${a.periodType} ${a.startDate}${a.endDate ? ' to ' + a.endDate : ''}`).join('; ')}
`).join('')}

Task: 
${Number(jobDetails.techsNeeded) > 1 ? 
  `Recommend a team of ${jobDetails.techsNeeded} technicians with complementary skills and assign roles:
   - Primary Lead: Most experienced/certified for job type
   - Support Members: Complementary skills, safety backup
   - Consider team dynamics, skill coverage, and coordination` :
  `Recommend the single best technician for this job`}

Provide JSON response as an ARRAY of recommended technicians:
[
  {
    "name": "Technician Name",
    "confidenceScore": 0-100,
    "role": "Lead" | "Specialist" | "Support",
    "reasoning": ["reason1", "reason2"],
    "availabilityStatus": "Excellent" | "Good" | "Limited" | "Unavailable",
    "teamDynamics": "Brief explanation (for multi-tech jobs only)",
    "coordinationPlan": "Leadership plan (for multi-tech jobs only)"
  }
]

Consider: certifications matching job type (UT, RT, MT, PT, VT), availability, experience levels, team compatibility.
Return ONLY the JSON array, no other text.
`;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();

      const content = data.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const rankings = JSON.parse(content.text);
      
      // Ensure rankings is an array
      if (!Array.isArray(rankings)) {
        logger.warn("Claude returned non-array response, using fallback", { rankingsType: typeof rankings });
        return this.fallbackRanking(jobDetails, availableTechnicians);
      }

      // Map Claude results to team members
      const teamMembers: TeamMember[] = rankings.map((ranking: any) => {
        const technicianData = techniciansData.find(t => t.name === ranking.name || t.id === ranking.id);
        if (!technicianData) {
          throw new Error(`Technician not found: ${ranking.name || ranking.id}`);
        }

        // Validate role
        const validRoles = ["Lead", "Specialist", "Support"] as const;
        const role = validRoles.includes(ranking.role) ? ranking.role : "Support";

        return {
          technician: technicianData,
          confidenceScore: Math.max(0, Math.min(100, ranking.confidenceScore || 50)),
          role,
          reasoning: ranking.reasoning || [`Matched for ${jobDetails.jobType} job`],
          availabilityStatus: ranking.availabilityStatus || "Good"
        };
      });

      // Sort by confidence score
      teamMembers.sort((a, b) => b.confidenceScore - a.confidenceScore);

      logger.info("Claude technician ranking completed", {
        jobType: jobDetails.jobType,
        technicianCount: teamMembers.length,
        topScore: teamMembers[0]?.confidenceScore || 0
      });

      return teamMembers;

    } catch (error) {
      logger.error("Claude technician ranking failed, using fallback", { error });
      return this.fallbackRanking(jobDetails, availableTechnicians);
    }
  }

  /**
   * Generate complete analysis with recommendations
   */
  async generateMatchAnalysis(
    jobDetails: JobDetails,
    availableTechnicians: Array<{
      technician: AirtableRecord<TechnicianFields>;
      availability: any[];
      matchScore: number;
    }>
  ): Promise<MatchAnalysis> {
    const startTime = Date.now();
    const fallbackUsed = !this.isConfigured;

    try {
      // Get job analysis and technician rankings
      const [jobAnalysis, teamMembers] = await Promise.all([
        this.analyzeJobRequirements(jobDetails),
        this.rankTechnicians(jobDetails, availableTechnicians)
      ]);

      if (teamMembers.length === 0) {
        throw new Error("No technicians available for analysis");
      }

      const requiredTeamSize = Number(jobDetails.techsNeeded) || 1;
      const selectedTeam = teamMembers.slice(0, requiredTeamSize);
      
      // Ensure we have a lead for multi-tech teams
      if (selectedTeam.length > 1 && !selectedTeam.some(m => m.role === "Lead")) {
        selectedTeam[0].role = "Lead";
      }

      const alternatives = teamMembers.slice(requiredTeamSize).map(member => ({
        technician: member.technician,
        confidenceScore: member.confidenceScore,
        reasoning: member.reasoning,
        availabilityStatus: member.availabilityStatus
      }));

      // Extract team dynamics from team members if available
      const teamDynamics = selectedTeam.length > 1 
        ? `Team of ${selectedTeam.length} with ${selectedTeam[0].technician.name} as lead technician`
        : undefined;

      const coordinationPlan = selectedTeam.length > 1
        ? `${selectedTeam[0].technician.name} (${selectedTeam[0].role}) leads coordination and technical oversight. Team roles: ${selectedTeam.map(m => `${m.technician.name} (${m.role})`).join(', ')}`
        : undefined;

      const analysis: MatchAnalysis = {
        teamComposition: {
          size: selectedTeam.length,
          members: selectedTeam,
          teamDynamics,
          coordinationPlan
        },
        topRecommendation: {
          technician: selectedTeam[0].technician,
          confidenceScore: selectedTeam[0].confidenceScore,
          reasoning: selectedTeam[0].reasoning,
          availabilityStatus: selectedTeam[0].availabilityStatus
        },
        alternatives,
        jobAnalysis,
        analysisTimestamp: new Date().toISOString(),
        fallbackUsed
      };

      const responseTime = Date.now() - startTime;
      logger.info("Complete match analysis generated", {
        jobType: jobDetails.jobType,
        teamSize: selectedTeam.length,
        topMatch: selectedTeam[0].technician.name,
        score: selectedTeam[0].confidenceScore,
        alternativeCount: alternatives.length,
        responseTime,
        fallbackUsed
      });

      return analysis;

    } catch (error) {
      logger.error("Match analysis generation failed", { error });
      
      // Return basic fallback analysis
      return {
        teamComposition: {
          size: 0,
          members: [],
          teamDynamics: undefined,
          coordinationPlan: undefined
        },
        topRecommendation: {
          technician: {
            id: "unknown",
            name: "No match available",
            certifications: [],
            status: "Active"
          },
          confidenceScore: 0,
          reasoning: ["Analysis failed - please check job requirements"],
          availabilityStatus: "Unknown"
        },
        alternatives: [],
        jobAnalysis: {
          complexity: "moderate",
          requiredSkills: [],
          estimatedDuration: "Unknown",
          recommendations: ["Manual review required"]
        },
        analysisTimestamp: new Date().toISOString(),
        fallbackUsed: true
      };
    }
  }

  private fallbackJobAnalysis(jobDetails: JobDetails): {
    requiredSkills: string[];
    complexity: "simple" | "moderate" | "complex";
    estimatedDuration: string;
    recommendations: string[];
  } {
    const jobType = jobDetails.jobType?.toLowerCase() || "";
    const description = (jobDetails.bodyPlain || "").toLowerCase();
    
    // Basic skill detection
    const requiredSkills: string[] = [];
    if (jobType.includes("ut") || description.includes("ultrasonic")) {
      requiredSkills.push("UT Level I", "UT Level II");
    }
    if (jobType.includes("rt") || description.includes("radiograph")) {
      requiredSkills.push("RT Level I", "RT Level II");
    }
    if (jobType.includes("mt") || description.includes("magnetic")) {
      requiredSkills.push("MT Level I");
    }
    if (description.includes("rope") || description.includes("access")) {
      requiredSkills.push("Rope Access");
    }
    if (description.includes("confined") || description.includes("space")) {
      requiredSkills.push("Confined Space");
    }

    // Basic complexity assessment
    let complexity: "simple" | "moderate" | "complex" = "moderate";
    if (requiredSkills.length <= 1) complexity = "simple";
    if (requiredSkills.length >= 3) complexity = "complex";

    return {
      requiredSkills,
      complexity,
      estimatedDuration: complexity === "simple" ? "2-4 hours" : complexity === "complex" ? "Full day" : "Half day",
      recommendations: [
        "Verify technician certifications are current",
        "Confirm equipment availability",
        "Review safety protocols for location"
      ]
    };
  }

  private fallbackRanking(
    jobDetails: JobDetails,
    availableTechnicians: Array<{
      technician: AirtableRecord<TechnicianFields>;
      availability: any[];
      matchScore: number;
    }>
  ): TeamMember[] {
    const jobType = jobDetails.jobType?.toLowerCase() || "";
    const requiredTeamSize = Number(jobDetails.techsNeeded) || 1;
    
    return availableTechnicians.map((t, index) => {
      const certifications = t.technician.fields["Technician Certifications"] || [];
      let score = 50; // Base score
      
      // Basic certification matching
      if (jobType.includes("ut") && certifications.some(c => c.toLowerCase().includes("ut"))) {
        score += 30;
      }
      if (jobType.includes("rt") && certifications.some(c => c.toLowerCase().includes("rt"))) {
        score += 30;
      }
      
      // Availability bonus
      if (t.availability.some(a => a.fields["Period Type"] === "Available")) {
        score += 10;
      }

      const reasoning = [`Basic match for ${jobDetails.jobType} job`];
      if (certifications.length > 0) {
        reasoning.push(`Has certifications: ${certifications.join(', ')}`);
      }
      if (t.availability.length > 0) {
        reasoning.push("Has availability records");
      }

      // Assign roles for multi-tech teams
      let role: "Lead" | "Specialist" | "Support" = "Support";
      if (requiredTeamSize > 1) {
        if (index === 0) role = "Lead";
        else if (score > 70) role = "Specialist";
      }

      return {
        technician: {
          id: t.technician.id,
          name: t.technician.fields.Name,
          certifications,
          status: t.technician.fields.Status
        },
        confidenceScore: Math.min(100, Math.max(0, score)),
        role,
        reasoning,
        availabilityStatus: "Good"
      };
    }).sort((a, b) => b.confidenceScore - a.confidenceScore);
  }
}

export const claudeMatchingService = new ClaudeMatchingService();