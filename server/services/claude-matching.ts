// Using fetch for Anthropic API to avoid dependency conflicts
// import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import type { TechnicianFields, AirtableRecord } from './airtable';

// Direct API integration to avoid dependency conflicts
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Strategic team building system prompt
const SYSTEM_PROMPT = `You are an expert industrial scheduling coordinator who matches qualified technicians to job requirements. You understand NDT certifications, safety requirements, team dynamics, and operational considerations.

Your job is to analyze job requests and build appropriately skilled teams. Consider all required skills and certifications, then suggest a team lead and supporting members.

Team composition principles:
- Ensure all critical job requirements are covered by qualified personnel
- Assign most experienced technician as team lead when multiple certifications overlap
- Build competent teams without over-staffing high-skill technicians on routine work
- Maintain skill redundancy for safety-critical operations (RT, confined space, rope access)
- Reserve your most versatile technicians for complex jobs requiring multiple certifications
- Use this as an opportunity to pair experienced leads with developing technicians when job complexity allows

Balance efficiency with capability: staff jobs appropriately without depleting your skilled workforce for future complex assignments.`;

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

export interface AlternativeTeam {
  size: number;
  members: TeamMember[];
  teamReasoning: string;
}

export interface MatchAnalysis {
  teamComposition: {
    size: number;
    members: TeamMember[];
    teamDynamics?: string;
    coordinationPlan?: string;
  };
  alternatives: AlternativeTechnician[];
  alternativeTeams?: AlternativeTeam[];
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
          system: SYSTEM_PROMPT,
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
   * Returns team-based recommendations with alternative team compositions
   */
  async rankTechnicians(
    jobDetails: JobDetails,
    availableTechnicians: Array<{
      technician: AirtableRecord<TechnicianFields>;
      availability: any[];
      matchScore: number;
    }>
  ): Promise<{
    recommendedTeam: {
      size: number;
      members: TeamMember[];
      teamDynamics?: string;
      coordinationPlan?: string;
    };
    alternativeTeams: AlternativeTeam[];
  }> {
    if (!this.isConfigured || availableTechnicians.length === 0) {
      return this.fallbackRanking(jobDetails, availableTechnicians);
    }

    try {
      const techniciansData = availableTechnicians.map(t => ({
        id: t.technician.id,
        name: t.technician.fields.Name,
        certifications: t.technician.fields.Certifications || [],
        status: t.technician.fields.Status,
        availability: t.availability.map(a => ({
          periodType: a.fields["Period Type"],
          startDate: a.fields["Start Date"],
          endDate: a.fields["End Date"],
          reason: a.fields.Reason
        }))
      }));

      const requiredTeamSize = Number(jobDetails.techsNeeded) || 1;
      const isMultiTechJob = requiredTeamSize > 1;
      
      const prompt = `
Analyze this job and recommend ${requiredTeamSize} technician(s):

Job Details:
- Type: ${jobDetails.jobType}
- Location: ${jobDetails.location}
- Date/Time: ${jobDetails.scheduledDate} at ${jobDetails.scheduledTime}
- Technicians Required: ${requiredTeamSize}
- Description: ${jobDetails.bodyPlain}

Available Technicians:
${techniciansData.map(t => `
- ${t.name}: ${t.certifications.join(', ') || 'No certifications'}
  Status: ${t.status}
  Availability: ${t.availability.map(a => a.periodType).join(', ') || 'Not specified'}
`).join('')}

${isMultiTechJob ? 
  `Build a ${requiredTeamSize}-person team with appropriate roles and explain why this combination works. Also provide 2-3 alternative team compositions.` :
  `Recommend the best individual technician and provide 2-3 alternatives.`}

Return JSON in this exact format:
{
  "recommendedTeam": {
    "size": ${requiredTeamSize},
    "members": [
      {
        "name": "Exact technician name",
        "role": "Lead" | "Specialist" | "Support",
        "confidenceScore": 85,
        "reasoning": ["specific reason 1", "specific reason 2"],
        "availabilityStatus": "Excellent" | "Good" | "Limited"
      }
    ],
    "teamDynamics": "${isMultiTechJob ? 'Team coordination explanation' : 'Individual assignment'}",
    "coordinationPlan": "${isMultiTechJob ? 'Leadership structure' : 'Solo technician plan'}"
  },
  "alternativeTeams": [
    {
      "size": ${requiredTeamSize},
      "members": [
        {
          "name": "Technician name",
          "role": "Lead" | "Specialist" | "Support",
          "confidenceScore": 80,
          "reasoning": ["reason 1", "reason 2"],
          "availabilityStatus": "Good"
        }
      ],
      "teamReasoning": "Why this alternative works"
    }
  ]
}

Return ONLY valid JSON, no other text.
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
          max_tokens: 3000,
          system: SYSTEM_PROMPT,
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

      const teamResponse = JSON.parse(content.text);
      
      // Validate response structure
      if (!teamResponse.recommendedTeam || !Array.isArray(teamResponse.recommendedTeam.members)) {
        logger.warn("Claude returned invalid response structure, using fallback", { response: teamResponse });
        return this.fallbackRanking(jobDetails, availableTechnicians);
      }

      // Process recommended team members with robust name matching
      const processMembers = (members: any[]): TeamMember[] => {
        return members.map((member: any) => {
          // Try to find technician by name (case-insensitive) or ID
          const technicianData = techniciansData.find(t => 
            t.name.toLowerCase() === (member.name || '').toLowerCase() || 
            t.id === member.id ||
            t.name.includes(member.name) ||
            (member.name || '').includes(t.name)
          );
          
          if (!technicianData) {
            logger.warn("Technician not found in available data, using fallback", { 
              memberName: member.name, 
              memberId: member.id,
              availableNames: techniciansData.map(t => t.name)
            });
            
            // Return a fallback structure with partial data
            return {
              technician: {
                id: member.id || "unknown",
                name: member.name || "Unknown Technician",
                certifications: [],
                status: "Unknown"
              },
              confidenceScore: Math.max(0, Math.min(100, member.confidenceScore || 50)),
              role: (["Lead", "Specialist", "Support"].includes(member.role) ? member.role : "Support") as "Lead" | "Specialist" | "Support",
              reasoning: member.reasoning || [`Matched for ${jobDetails.jobType} job`],
              availabilityStatus: member.availabilityStatus || "Unknown"
            };
          }

          const validRoles = ["Lead", "Specialist", "Support"] as const;
          const role = validRoles.includes(member.role) ? member.role : "Support";

          return {
            technician: technicianData,
            confidenceScore: Math.max(0, Math.min(100, member.confidenceScore || 50)),
            role,
            reasoning: member.reasoning || [`Matched for ${jobDetails.jobType} job`],
            availabilityStatus: member.availabilityStatus || "Good"
          };
        });
      };

      const recommendedTeamMembers = processMembers(teamResponse.recommendedTeam.members);
      
      // Process alternative teams
      const alternativeTeams: AlternativeTeam[] = (teamResponse.alternativeTeams || []).map((altTeam: any) => ({
        size: altTeam.size || altTeam.members.length,
        members: processMembers(altTeam.members),
        teamReasoning: altTeam.teamReasoning || "Alternative team composition"
      }));

      // Validate team size matches job requirements
      const requiredSize = Number(jobDetails.techsNeeded) || 1;
      if (recommendedTeamMembers.length !== requiredSize) {
        logger.warn("Team size mismatch", {
          requested: requiredSize,
          recommended: recommendedTeamMembers.length
        });
      }

      logger.info("Claude team-based ranking completed", {
        jobType: jobDetails.jobType,
        teamSize: recommendedTeamMembers.length,
        alternativeTeamsCount: alternativeTeams.length,
        topScore: recommendedTeamMembers[0]?.confidenceScore || 0
      });

      return {
        recommendedTeam: {
          size: recommendedTeamMembers.length,
          members: recommendedTeamMembers,
          teamDynamics: teamResponse.recommendedTeam.teamDynamics,
          coordinationPlan: teamResponse.recommendedTeam.coordinationPlan
        },
        alternativeTeams
      };

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
      const [jobAnalysis, teamRanking] = await Promise.all([
        this.analyzeJobRequirements(jobDetails),
        this.rankTechnicians(jobDetails, availableTechnicians)
      ]);

      if (teamRanking.recommendedTeam.members.length === 0) {
        throw new Error("No technicians available for analysis");
      }

      const { recommendedTeam, alternativeTeams } = teamRanking;

      // Build individual alternatives list for backward compatibility
      const alternatives: AlternativeTechnician[] = alternativeTeams.flatMap(team => 
        team.members.map(member => ({
          technician: member.technician,
          confidenceScore: member.confidenceScore,
          reasoning: member.reasoning,
          availabilityStatus: member.availabilityStatus
        }))
      );

      const analysis: MatchAnalysis = {
        teamComposition: recommendedTeam,
        topRecommendation: {
          technician: recommendedTeam.members[0].technician,
          confidenceScore: recommendedTeam.members[0].confidenceScore,
          reasoning: recommendedTeam.members[0].reasoning,
          availabilityStatus: recommendedTeam.members[0].availabilityStatus
        },
        alternatives,
        alternativeTeams,
        jobAnalysis,
        analysisTimestamp: new Date().toISOString(),
        fallbackUsed
      };

      const responseTime = Date.now() - startTime;
      logger.info("Complete match analysis generated", {
        jobType: jobDetails.jobType,
        teamSize: recommendedTeam.size,
        topMatch: recommendedTeam.members[0].technician.name,
        score: recommendedTeam.members[0].confidenceScore,
        alternativeTeamsCount: alternativeTeams.length,
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
  ): {
    recommendedTeam: {
      size: number;
      members: TeamMember[];
      teamDynamics?: string;
      coordinationPlan?: string;
    };
    alternativeTeams: AlternativeTeam[];
  } {
    const jobType = jobDetails.jobType?.toLowerCase() || "";
    const requiredTeamSize = Number(jobDetails.techsNeeded) || 1;
    
    const allMembers = availableTechnicians.map((t, index) => {
      const certifications = t.technician.fields.Certifications || [];
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

      const reasoning = [`Basic match for ${jobDetails.jobType || 'job'}`];
      if (certifications.length > 0) {
        reasoning.push(`Has certifications: ${certifications.join(', ')}`);
      }
      if (t.availability.length > 0) {
        reasoning.push("Has availability records");
      }

      return {
        technician: {
          id: t.technician.id,
          name: t.technician.fields.Name,
          certifications,
          status: t.technician.fields.Status
        },
        confidenceScore: Math.min(100, Math.max(0, score)),
        role: "Support" as const,
        reasoning,
        availabilityStatus: "Good" as const
      };
    }).sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Assign roles to recommended team
    const recommendedMembers = allMembers.slice(0, requiredTeamSize).map((member, index) => ({
      ...member,
      role: (index === 0 && requiredTeamSize > 1 ? "Lead" : 
             member.confidenceScore > 70 && requiredTeamSize > 1 ? "Specialist" : 
             "Support") as "Lead" | "Specialist" | "Support"
    }));

    // Build alternative teams
    const alternativeTeams: AlternativeTeam[] = [];
    if (allMembers.length > requiredTeamSize) {
      // Create 2 alternative team compositions
      for (let i = 0; i < Math.min(2, allMembers.length - requiredTeamSize); i++) {
        const altMembers = [
          ...allMembers.slice(i + 1, i + 1 + requiredTeamSize)
        ].map((member, index) => ({
          ...member,
          role: (index === 0 && requiredTeamSize > 1 ? "Lead" : "Support") as "Lead" | "Specialist" | "Support"
        }));

        if (altMembers.length === requiredTeamSize) {
          alternativeTeams.push({
            size: requiredTeamSize,
            members: altMembers,
            teamReasoning: `Alternative ${i + 1}: Backup team with ${altMembers[0].technician.name} leading`
          });
        }
      }
    }

    const teamDynamics = requiredTeamSize > 1 
      ? `Team of ${requiredTeamSize} with ${recommendedMembers[0].technician.name} as lead technician`
      : undefined;

    const coordinationPlan = requiredTeamSize > 1
      ? `${recommendedMembers[0].technician.name} (Lead) coordinates team. Roles: ${recommendedMembers.map(m => `${m.technician.name} (${m.role})`).join(', ')}`
      : undefined;

    return {
      recommendedTeam: {
        size: recommendedMembers.length,
        members: recommendedMembers,
        teamDynamics,
        coordinationPlan
      },
      alternativeTeams
    };
  }
}

export const claudeMatchingService = new ClaudeMatchingService();