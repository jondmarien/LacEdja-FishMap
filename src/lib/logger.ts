type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class Logger {
  private isProduction = import.meta.env.PROD
  private isServer = typeof window === 'undefined'

  private format(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()
    const prefix = this.isServer ? '[SERVER]' : '[CLIENT]'

    if (this.isProduction) {
      // Structured JSON for production (great for Vercel logs)
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context,
        environment: this.isServer ? 'server' : 'client',
      })
    } else {
      // Pretty output for development
      const color = {
        debug: '\x1b[36m',   // cyan
        info: '\x1b[32m',    // green
        warn: '\x1b[33m',    // yellow
        error: '\x1b[31m',   // red
      }[level]

      const reset = '\x1b[0m'
      let output = `${color}${prefix} [${level.toUpperCase()}]${reset} ${message}`

      if (context && Object.keys(context).length > 0) {
        output += ` ${JSON.stringify(context)}`
      }
      return output
    }
  }

  debug(message: string, context?: LogContext) {
    if (!this.isProduction) {
      console.debug(this.format('debug', message, context))
    }
  }

  info(message: string, context?: LogContext) {
    console.log(this.format('info', message, context))
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.format('warn', message, context))
  }

  error(message: string, context?: LogContext) {
    console.error(this.format('error', message, context))
  }

  // Special method for API routes (always logs)
  api(level: LogLevel, message: string, context?: LogContext) {
    console.log(this.format(level, `[API] ${message}`, context))
  }
}

export const logger = new Logger()
export default logger
