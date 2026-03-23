import { inspect, InspectOptions } from 'util';
import { LoggerService, Optional, LogLevel } from '@nestjs/common';
import { isPlainObject } from './utils';

const DEFAULT_DEPTH = 5;

const colors = [
    20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62, 63, 68, 69, 74, 75, 76, 77, 78,
    79, 80, 81, 92, 93, 98, 99, 112, 113, 128, 129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165,
    166, 167, 168, 169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200, 201, 202, 203,
    204, 205, 206, 207, 208, 209, 214, 215, 220, 221
];

type ColorTextFn = (text: string) => string;

const isColorAllowed = () => !process.env.NO_COLOR;
const colorIfAllowed = (colorFn: ColorTextFn) => (text: string) =>
    isColorAllowed() ? colorFn(text) : text;

export const clc = {
    bold: colorIfAllowed((text: string) => `\x1B[1m${text}\x1B[0m`),
    green: colorIfAllowed((text: string) => `\x1B[32m${text}\x1B[39m`),
    yellow: colorIfAllowed((text: string) => `\x1B[33m${text}\x1B[39m`),
    red: colorIfAllowed((text: string) => `\x1B[31m${text}\x1B[39m`),
    magentaBright: colorIfAllowed((text: string) => `\x1B[95m${text}\x1B[39m`),
    cyanBright: colorIfAllowed((text: string) => `\x1B[96m${text}\x1B[39m`),
    white: colorIfAllowed((text: string) => `\x1B[37m${text}\x1B[39m`),
};

export interface ColorLoggerOptions {
    /**
     * Enabled log levels.
     */
    logLevels?: LogLevel[];
    /**
     * If enabled, will print timestamp (time difference) between current and previous log message.
     * Note: This option is not used when `json` is enabled.
     */
    timestamp?: boolean;
    /**
     * A prefix to be used for each log message.
     * Note: This option is not used when `json` is enabled.
     * @default 'Nest'
     */
    prefix?: string;
    /**
     * If enabled, will print the log message in JSON format.
     */
    json?: boolean;
    /**
     * If enabled, will print the log message in color.
     * Default true if json is disabled, false otherwise.
     */
    colors?: boolean;
    /**
     * The context of the logger.
     */
    context?: string;
    /**
     * If enabled, will force the use of console.log/console.error instead of process.stdout/stderr.write.
     * This is useful for test environments like Jest that can buffer console calls.
     * @default false
     */
    forceConsole?: boolean;
    /**
     * If enabled, will print the log message in a single line, even if it is an object with multiple properties.
     * If set to a number, the most n inner elements are united on a single line as long as all properties fit into breakLength.
     * Default true when `json` is enabled, false otherwise.
     */
    compact?: boolean | number;
    /**
     * Specifies the maximum number of Array, TypedArray, Map, Set, WeakMap, and WeakSet elements to include when formatting.
     * Set to null or Infinity to show all elements. Set to 0 or negative to show no elements.
     * @default 100
     */
    maxArrayLength?: number;
    /**
     * Specifies the maximum number of characters to include when formatting.
     * Set to null or Infinity to show all elements. Set to 0 or negative to show no characters.
     * @default 10000
     */
    maxStringLength?: number;
    /**
     * If enabled, will sort keys while formatting objects.
     * Can also be a custom sorting function.
     * @default false
     */
    sorted?: boolean | ((a: string, b: string) => number);
    /**
     * Specifies the number of times to recurse while formatting object.
     * @default 5
     */
    depth?: number;
    /**
     * If true, object's non-enumerable symbols and properties are included in the formatted result.
     * @default false
     */
    showHidden?: boolean;
    /**
     * The length at which input values are split across multiple lines.
     * Default Infinity when "compact" is true, 80 otherwise.
     */
    breakLength?: number;
}

const DEFAULT_LOG_LEVELS: LogLevel[] = [
    'log',
    'error',
    'warn',
    'debug',
    'verbose',
    'fatal',
];

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    day: '2-digit',
    month: '2-digit',
});

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
    verbose: 0,
    debug: 1,
    log: 2,
    warn: 3,
    error: 4,
    fatal: 5,
};

/**
 * Checks if target level is enabled.
 * @param targetLevel target level
 * @param logLevels array of enabled log levels
 */
export function isLogLevelEnabled(
    targetLevel: LogLevel,
    logLevels: LogLevel[] | undefined,
): boolean {
    if (!logLevels || (Array.isArray(logLevels) && logLevels?.length === 0)) {
        return false;
    }
    if (logLevels.includes(targetLevel)) {
        return true;
    }
    const highestLogLevelValue = logLevels
        .map(level => LOG_LEVEL_VALUES[level])
        .sort((a, b) => b - a)?.[0];

    const targetLevelValue = LOG_LEVEL_VALUES[targetLevel];
    return targetLevelValue >= highestLogLevelValue;
}

export class ColorLogger implements LoggerService {
    protected options: ColorLoggerOptions;
    protected context?: string;
    protected originalContext?: string;
    protected inspectOptions: InspectOptions;
    protected static lastTimestampAt?: number;

    constructor();
    constructor(context: string);
    constructor(options: ColorLoggerOptions);
    constructor(context: string, options: ColorLoggerOptions);
    constructor(
        @Optional()
        contextOrOptions?: string | ColorLoggerOptions,
        @Optional()
        options?: ColorLoggerOptions,
    ) {
        let [context, opts] = typeof contextOrOptions === 'string'
            ? [contextOrOptions, options]
            : options
                ? [undefined, options]
                : [contextOrOptions?.context, contextOrOptions];

        opts = opts ?? {};
        opts.logLevels ??= DEFAULT_LOG_LEVELS;
        opts.colors ??= opts.json ? false : isColorAllowed();
        opts.prefix ??= 'Nest';

        this.options = opts;
        this.inspectOptions = this.getInspectOptions();

        if (context) {
            this.context = context;
            this.originalContext = context;
        }
    }

    /**
     * Write a 'log' level log, if the configured level allows for it.
     * Prints to `stdout` with newline.
     */
    log(message: any, context?: string): void;
    log(message: any, ...optionalParams: [...any, string?]): void;
    log(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('log')) {
            return;
        }
        const { messages, context } = this.getContextAndMessagesToPrint([
            message,
            ...optionalParams,
        ]);
        this.printMessages(messages, context, 'log');
    }

    /**
     * Write an 'error' level log, if the configured level allows for it.
     * Prints to `stderr` with newline.
     */
    error(message: any, stackOrContext?: string): void;
    error(message: any, stack?: string, context?: string): void;
    error(message: any, ...optionalParams: [...any, string?, string?]): void;
    error(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('error')) {
            return;
        }
        const { messages, context, stack } =
            this.getContextAndStackAndMessagesToPrint([message, ...optionalParams]);

        this.printMessages(messages, context, 'error', 'stderr', stack);
        this.printStackTrace(stack);
    }

    /**
     * Write a 'warn' level log, if the configured level allows for it.
     * Prints to `stdout` with newline.
     */
    warn(message: any, context?: string): void;
    warn(message: any, ...optionalParams: [...any, string?]): void;
    warn(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('warn')) {
            return;
        }
        const { messages, context } = this.getContextAndMessagesToPrint([
            message,
            ...optionalParams,
        ]);
        this.printMessages(messages, context, 'warn');
    }

    /**
     * Write a 'debug' level log, if the configured level allows for it.
     * Prints to `stdout` with newline.
     */
    debug(message: any, context?: string): void;
    debug(message: any, ...optionalParams: [...any, string?]): void;
    debug(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('debug')) {
            return;
        }
        const { messages, context } = this.getContextAndMessagesToPrint([
            message,
            ...optionalParams,
        ]);
        this.printMessages(messages, context, 'debug');
    }

    /**
     * Write a 'verbose' level log, if the configured level allows for it.
     * Prints to `stdout` with newline.
     */
    verbose(message: any, context?: string): void;
    verbose(message: any, ...optionalParams: [...any, string?]): void;
    verbose(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('verbose')) {
            return;
        }
        const { messages, context } = this.getContextAndMessagesToPrint([
            message,
            ...optionalParams,
        ]);
        this.printMessages(messages, context, 'verbose');
    }

    /**
     * Write a 'fatal' level log, if the configured level allows for it.
     * Prints to `stdout` with newline.
     */
    fatal(message: any, context?: string): void;
    fatal(message: any, ...optionalParams: [...any, string?]): void;
    fatal(message: any, ...optionalParams: any[]) {
        if (!this.isLevelEnabled('fatal')) {
            return;
        }
        const { messages, context } = this.getContextAndMessagesToPrint([
            message,
            ...optionalParams,
        ]);
        this.printMessages(messages, context, 'fatal');
    }

    /**
     * Set log levels
     * @param levels log levels
     */
    setLogLevels(levels: LogLevel[]) {
        if (!this.options) {
            this.options = {};
        }
        this.options.logLevels = levels;
    }

    /**
     * Set logger context
     * @param context context
     */
    setContext(context: string) {
        this.context = context;
    }

    /**
     * Resets the logger context to the value that was passed in the constructor.
     */
    resetContext() {
        this.context = this.originalContext;
    }

    isLevelEnabled(level: LogLevel): boolean {
        const logLevels = this.options?.logLevels;
        return isLogLevelEnabled(level, logLevels);
    }

    protected getTimestamp(): string {
        return dateTimeFormatter.format(Date.now());
    }

    protected printMessages(
        messages: unknown[],
        context = '',
        logLevel: LogLevel = 'log',
        writeStreamType?: 'stdout' | 'stderr',
        errorStack?: unknown,
    ) {
        messages.forEach(message => {
            if (this.options.json) {
                this.printAsJson(message, {
                    context,
                    logLevel,
                    writeStreamType,
                    errorStack,
                });
                return;
            }
            const pidMessage = this.formatPid(process.pid);
            const contextMessage = this.formatContext(context);
            const timestampDiff = this.updateAndGetTimestampDiff(context);
            const formattedLogLevel = logLevel.toUpperCase().padStart(7, ' ');
            const formattedMessage = this.formatMessage(
                logLevel,
                message,
                pidMessage,
                formattedLogLevel,
                contextMessage,
                timestampDiff,
            );

            if (this.options.forceConsole) {
                if (writeStreamType === 'stderr') {
                    console.error(formattedMessage.trim());
                } else {
                    console.log(formattedMessage.trim());
                }
            } else {
                process[writeStreamType ?? 'stdout'].write(formattedMessage);
            }
        });
    }

    protected printAsJson(
        message: unknown,
        options: {
            context: string;
            logLevel: LogLevel;
            writeStreamType?: 'stdout' | 'stderr';
            errorStack?: unknown;
        },
    ) {
        const logObject = this.getJsonLogObject(message, options);
        const formattedMessage =
            !this.options.colors && this.inspectOptions.compact === true
                ? JSON.stringify(logObject, this.stringifyReplacer.bind(this))
                : inspect(logObject, this.inspectOptions);
        if (this.options.forceConsole) {
            if (options.writeStreamType === 'stderr') {
                console.error(formattedMessage);
            } else {
                console.log(formattedMessage);
            }
        } else {
            process[options.writeStreamType ?? 'stdout'].write(
                `${formattedMessage}\n`,
            );
        }
    }

    protected getJsonLogObject(
        message: unknown,
        options: {
            context: string;
            logLevel: LogLevel;
            writeStreamType?: 'stdout' | 'stderr';
            errorStack?: unknown;
        },
    ) {
        type JsonLogObject = {
            level: LogLevel;
            pid: number;
            timestamp: number;
            message: unknown;
            context?: string;
            stack?: unknown;
        };

        const logObject: JsonLogObject = {
            level: options.logLevel,
            pid: process.pid,
            timestamp: Date.now(),
            message,
        };

        if (options.context) {
            logObject.context = options.context;
        }

        if (options.errorStack) {
            logObject.stack = options.errorStack;
        }
        return logObject;
    }

    protected formatPid(pid: number) {
        return `[${this.options.prefix}] ${pid}  - `;
    }

    protected formatContext(context: string): string {
        if (!context) {
            return '';
        }
        return this.colorText(context, `[${context}] `);
    }

    protected formatMessage(
        logLevel: LogLevel,
        message: unknown,
        pidMessage: string,
        formattedLogLevel: string,
        contextMessage: string,
        timestampDiff: string,
    ) {
        const output = this.stringifyMessage(message, logLevel);
        pidMessage = this.colorize(pidMessage, logLevel);
        formattedLogLevel = this.colorize(formattedLogLevel, logLevel);
        return `${pidMessage}${this.getTimestamp()} ${formattedLogLevel} ${contextMessage}${output}${timestampDiff}\n`;
    }

    protected stringifyMessage(message: unknown, logLevel: LogLevel): string {
        if (typeof message === 'function') {
            const messageAsStr = Function.prototype.toString.call(message);
            const isClass = messageAsStr.startsWith('class ');
            if (isClass) {
                return this.stringifyMessage(message.name, logLevel);
            }
            return this.stringifyMessage(message(), logLevel);
        }

        if (typeof message === 'string') {
            return this.colorizeMessage(message, logLevel);
        }

        const outputText = inspect(message, this.inspectOptions);
        if (isPlainObject(message)) {
            return `Object(${Object.keys(message as object).length}) ${outputText}`;
        }
        if (Array.isArray(message)) {
            return `Array(${message.length}) ${outputText}`;
        }
        return outputText;
    }

    protected colorize(message: string, logLevel: LogLevel) {
        if (!this.options.colors || this.options.json) {
            return message;
        }
        const color = this.getColorByLogLevel(logLevel);
        return color(message);
    }

    protected colorizeMessage(message: string, logLevel: LogLevel) {
        if (!this.options.colors || this.options.json) {
            return message;
        }
        const color = this.getMessageColorByLogLevel(logLevel);
        return color(message);
    }

    protected printStackTrace(stack?: string) {
        if (!stack || this.options.json) {
            return;
        }
        if (this.options.forceConsole) {
            console.error(stack);
        } else {
            process.stderr.write(`${stack}\n`);
        }
    }

    protected updateAndGetTimestampDiff(context = ''): string {
        const includeTimestamp =
            ColorLogger.lastTimestampAt && this.options?.timestamp;
        const result = includeTimestamp
            ? this.formatTimestampDiff(context, Date.now() - ColorLogger.lastTimestampAt!)
            : '';
        ColorLogger.lastTimestampAt = Date.now();
        return result;
    }

    protected formatTimestampDiff(context: string, timestampDiff: number) {
        const formattedDiff = ` +${timestampDiff}ms`;
        return this.colorText(context, formattedDiff);
    }

    protected getInspectOptions(): InspectOptions {
        let breakLength = this.options.breakLength;
        if (typeof breakLength === 'undefined') {
            breakLength = this.options.colors
                ? this.options.compact
                    ? Infinity
                    : undefined
                : this.options.compact === false
                    ? undefined
                    : Infinity;
        }

        const inspectOptions: InspectOptions = {
            depth: this.options.depth ?? DEFAULT_DEPTH,
            sorted: this.options.sorted,
            showHidden: this.options.showHidden,
            compact: this.options.compact ?? (this.options.json ? true : false),
            colors: this.options.colors,
            breakLength,
        };

        if (typeof this.options.maxArrayLength !== 'undefined') {
            inspectOptions.maxArrayLength = this.options.maxArrayLength;
        }
        if (typeof this.options.maxStringLength !== 'undefined') {
            inspectOptions.maxStringLength = this.options.maxStringLength;
        }

        return inspectOptions;
    }

    protected stringifyReplacer(key: string, value: unknown) {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (typeof value === 'symbol') {
            return value.toString();
        }

        if (
            value instanceof Map ||
            value instanceof Set ||
            value instanceof Error
        ) {
            return `${inspect(value, this.inspectOptions)}`;
        }
        return value;
    }

    private getContextAndMessagesToPrint(args: unknown[]) {
        if (args?.length <= 1) {
            return { messages: args, context: this.context };
        }
        const lastElement = args[args.length - 1];
        const isContext = typeof lastElement === 'string';
        if (!isContext) {
            return { messages: args, context: this.context };
        }
        return {
            context: lastElement as string,
            messages: args.slice(0, args.length - 1),
        };
    }

    private getContextAndStackAndMessagesToPrint(args: unknown[]) {
        if (args.length === 2) {
            return this.isStackFormat(args[1])
                ? {
                    messages: [args[0]],
                    stack: args[1] as string,
                    context: this.context,
                }
                : { ...this.getContextAndMessagesToPrint(args) };
        }

        const { messages, context } = this.getContextAndMessagesToPrint(args);
        if (messages?.length <= 1) {
            return { messages, context };
        }
        const lastElement = messages[messages.length - 1];
        const isStack = typeof lastElement === 'string';
        // https://github.com/nestjs/nest/issues/11074#issuecomment-1421680060
        if (!isStack && lastElement !== undefined) {
            return { messages, context };
        }
        return {
            stack: lastElement as string,
            messages: messages.slice(0, messages.length - 1),
            context,
        };
    }

    private isStackFormat(stack: unknown) {
        if (typeof stack !== 'string' && stack !== undefined) {
            return false;
        }

        return /^(.)+\n\s+at .+:\d+:\d+/.test(stack!);
    }

    private getColorByLogLevel(level: LogLevel) {
        switch (level) {
            case 'debug':
                return clc.magentaBright;
            case 'warn':
                return clc.yellow;
            case 'error':
                return clc.red;
            case 'verbose':
                return clc.cyanBright;
            case 'fatal':
                return clc.bold;
            default:
                return clc.green;
        }
    }

    private getMessageColorByLogLevel(level: LogLevel) {
        switch (level) {
            case 'log':
            case 'verbose':
            case 'debug':
                return clc.white;
            case 'warn':
                return clc.yellow;
            case 'error':
                return clc.red;
            case 'fatal':
                return clc.bold;
            default:
                return clc.white;
        }
    }

    colorText(context: string, text: string) {
        if (!this.options.colors) {
            return text;
        }

        const c = this.selectColor(context);
        const colorCode = '\x1B[3' + (c < 8 ? c : '8;5;' + c) + 'm';
        return `${colorCode}${text}\x1B[39m`;
    }

    selectColor(context = '') {
        let hash = 0;

        for (let i = 0; i < context.length; i++) {
            hash = ((hash << 5) - hash) + context.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }

        return colors[Math.abs(hash) % colors.length];
    }
}
