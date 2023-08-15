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
    const files: {input: string | 0, output: string | 1} = {input: 0, output: 1};

    for (let f = 2; f < args.length; f += 1)
    {
        if (args[f].startsWith("-"))
        {
            if (["-v", "-version", "--version"].includes(args[f]))
            {
                console.log("html_TeX: 1.0.0");
                process.exit();
            }
            else if (["-h", "-help", "--help"].includes(args[f]))
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
                console.log("Read documentation for more information.");
                process.exit();
            }
            else if (["-f", "-force", "--force"].includes(args[f]))
            {
                force = true;
            }
            else
            {
                console.error("Unknown flag.");
                process.exit();
            }
        }
        else if (files.input == 0)
        {
            files.input = args[f];
        }
        else if (files.output == 1)
        {
            files.output = args[f];
        }
        else
        {
            console.error("Too many argumets.");
            process.exit();
        }
    }

    if (files.input != 0)
    {
        if (files.output == 1)
        {
            if (!fs.existsSync(files.input))
            {
                console.error(`Input file "${files.input}" doesn't exist.`);
                process.exit();
            }
            files.output = path.basename(files.input, ".html") + ".tex";
            if (fs.existsSync(files.output) && !force)
            {
                console.error(`Output file "${files.output}" already exists.`);
                process.exit();
            }

        }
        else
        {
            if (!fs.existsSync(files.input))
            {
                console.error(`Input file "${files.input}" doesn't exist.`);
                process.exit();
            }
            if (fs.existsSync(files.output) && !force)
            {
                console.error(`Output file "${files.output}" already exists.`);
                process.exit();
            }
        }
    }

    return files;
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
