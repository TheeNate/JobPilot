interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory
  
  private log(level: string, message: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
    };
    
    // Add to in-memory logs
    this.logs.push(entry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output for development
    const logLine = `${entry.timestamp} [${level}] ${message}`;
    console.log(logLine, metadata || '');
  }
  
  info(message: string, metadata?: any) {
    this.log('INFO', message, metadata);
  }
  
  warn(message: string, metadata?: any) {
    this.log('WARN', message, metadata);
  }
  
  error(message: string, metadata?: any) {
    this.log('ERROR', message, metadata);
  }
  
  debug(message: string, metadata?: any) {
    this.log('DEBUG', message, metadata);
  }
  
  getLogs(limit = 100) {
    return this.logs.slice(-limit).reverse(); // Most recent first
  }
  
  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();
