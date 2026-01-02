/**
 * Headless entry point for GitHub Actions / CI environments
 * This avoids loading TUI dependencies (React, SolidJS, etc.)
 */
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Log } from "./util/log"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { NamedError } from "@opencode-ai/util/error"
import { FormatError } from "./cli/error"
import { GithubCommand } from "./cli/cmd/github"
import { EOL } from "os"

process.on("unhandledRejection", (e) => {
    Log.Default.error("rejection", {
        e: e instanceof Error ? e.message : e,
    })
})

process.on("uncaughtException", (e) => {
    Log.Default.error("exception", {
        e: e instanceof Error ? e.message : e,
    })
})

const cli = yargs(hideBin(process.argv))
    .parserConfiguration({ "populate--": true })
    .scriptName("opencode")
    .wrap(100)
    .help("help", "show help")
    .alias("help", "h")
    .version("version", "show version number", Installation.VERSION)
    .alias("version", "v")
    .option("print-logs", {
        describe: "print logs to stderr",
        type: "boolean",
    })
    .option("log-level", {
        describe: "log level",
        type: "string",
        choices: ["DEBUG", "INFO", "WARN", "ERROR"],
    })
    .middleware(async (opts) => {
        await Log.init({
            print: process.argv.includes("--print-logs"),
            dev: Installation.isLocal(),
            level: (() => {
                if (opts.logLevel) return opts.logLevel as Log.Level
                if (Installation.isLocal()) return "DEBUG"
                return "INFO"
            })(),
        })

        process.env.AGENT = "1"
        process.env.OPENCODE = "1"

        Log.Default.info("opencode-ci", {
            version: Installation.VERSION,
            args: process.argv.slice(2),
        })
    })
    .usage("\nopencode CI/GitHub Actions runner")
    .command(GithubCommand)
    .demandCommand(1, "You must specify a command")
    .strict()

try {
    await cli.parse()
} catch (e) {
    let data: Record<string, any> = {}
    if (e instanceof NamedError) {
        const obj = e.toObject()
        Object.assign(data, {
            ...obj.data,
        })
    }

    if (e instanceof Error) {
        Object.assign(data, {
            name: e.name,
            message: e.message,
            cause: e.cause?.toString(),
            stack: e.stack,
        })
    }

    if (e instanceof ResolveMessage) {
        Object.assign(data, {
            name: e.name,
            message: e.message,
            code: e.code,
            specifier: e.specifier,
            referrer: e.referrer,
            position: e.position,
            importKind: e.importKind,
        })
    }
    Log.Default.error("fatal", data)
    const formatted = FormatError(e)
    if (formatted) UI.error(formatted)
    if (formatted === undefined) {
        UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
        console.error(e)
    }
    process.exitCode = 1
} finally {
    process.exit()
}
