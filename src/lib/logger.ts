type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class Logger {
  private isServer = typeof window === 'undefined'
  
  // Safe environment detection that works in both browser and Node.js.
  // Access `process` via globalThis so the client build doesn't require Node
  // type definitions.
  private isProduction = this.isServer
    ? (globalThis as any).process?.env?.NODE_ENV === 'production'
    : (typeof import.meta !== 'undefined' &&
        (import.meta as any).env &&
        (import.meta as any).env.PROD) ?? false

  private format(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()
    const prefix = this.isServer ? '[SERVER]' : '[CLIENT]'

    if (this.isProduction) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context,
        environment: this.isServer ? 'server' : 'client',
      })
    } else {
      const color = {
        debug: '\x1b[36m',
        info: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
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

  api(level: LogLevel, message: string, context?: LogContext) {
    const formatted = this.format(level, `[API] ${message}`, context)
    if (level === 'error') {
      console.error(formatted)
    } else if (level === 'warn') {
      console.warn(formatted)
    } else {
      console.log(formatted)
    }
  }
}

export const logger = new Logger()
export default logger
