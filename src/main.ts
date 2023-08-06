import * as fs from "node:fs";
import * as path from "node:path"

import {TREE} from "./tree";
import {BUFFER} from "./buffer";
import {tokenise} from "./tokeniser";

function on_parse_error(message: string): void
{
    console.error(message);
}
function on_uncaught_exception(e: Error): void
{
    console.error("Uncaught exception: " + e.message);
    console.error(e.stack);
}

function parse_args(args: string[]): {input: string | 0, output: string | 1}
{
    let force = false;
    if (args[args.length - 1] == "-f" || args[args.length - 1] == "-force" || args[args.length - 1] == "--force")
    {
        force = true;
        args.pop();
    }

    if (args.length < 3)
    {
        return {
            input: 0,
            output: 1
        }
    }
    else if (args[2] == "-v" || args[2] == "-version" || args[2] == "--version")
    {
        console.log("html_TeX: 1.0.0");
        process.exit();
    }
    else if (args[2] == "-h" || args[2] == "-help" || args[2] == "--help")
    {
        console.log("Usage:")
        console.log("  1) node html_TeX.js");
        console.log("  2) node html_TeX.js [input_file]");
        console.log("  3) node html_TeX.js [input_file] [output_file]");
        console.log("Explanation:")
        console.log("  1) Reads stdin and writes into stdout.");
        console.log("  2) Reads [input_file] and writes into [input_file].tex");
        console.log("  3) Reads [input_file] and writes into [output_file].");
        console.log("\nIf the target file already exists, it won't be overwritten unless the flaf -f is specified.");
        process.exit();
    }
    else if (args.length == 3)
    {
        if (!fs.existsSync(args[2]))
        {
            console.error(`Input file "${args[2]} doesn't exist."`);
            process.exit();
        }
        let output_file = path.basename(args[2], ".html") + ".tex";
        if (fs.existsSync(output_file) && !force)
        {
            console.error(`Output file "${output_file} already exists."`);
            process.exit();
        }
        return {
            input: args[2],
            output: output_file
        }
    }
    else if (args.length == 4)
    {
        if (!fs.existsSync(args[2]))
        {
            console.error(`Input file "${args[2]} doesn't exist."`);
            process.exit();
        }
        if (fs.existsSync(args[3]) && !force)
        {
            console.error(`Output file "${args[3]} already exists."`);
            process.exit();
        }
        return {
            input: args[2],
            output: args[3]
        }
    }
    else
    {
        throw new Error("To much arguments.");
    }
}

function main(): void
{
    const args = parse_args(process.argv);
    const input = args.input;
    const output = args.output;
    
    const source = fs.readFileSync(input, "utf-8");
    const b = new BUFFER(source);
    const t = new TREE(output, on_parse_error);
    tokenise(b, on_parse_error, t.receive_token.bind(t));
}

process.on("uncaughtException", on_uncaught_exception);
main();
