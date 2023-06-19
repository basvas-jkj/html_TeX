import * as fs from "node:fs";

import {TOKEN} from "./token";
import {tokenise} from "./tokeniser"

function on_parse_error(message: string): void
{
    console.error(message);
}
function on_token(t: TOKEN)
{
    if (t.type != "ch")
        console.log(t.to_string());
}
function on_uncaught_exception(e: Error)
{
    console.error("Uncaught exception: " + e.message);
}

function main(): void
{
    const source = fs.readFileSync("ex.html", "utf-8");
    tokenise(source, on_parse_error, on_token);
}

process.on("uncaughtException", on_uncaught_exception);
main();