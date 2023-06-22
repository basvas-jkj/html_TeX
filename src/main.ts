import * as fs from "node:fs";

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
}

function main(): void
{
    const source = fs.readFileSync("ex.html", "utf-8");
    const b = new BUFFER(source);
    const t = new TREE(on_parse_error);
    tokenise(b, on_parse_error, t.receive_token.bind(t));
}

process.on("uncaughtException", on_uncaught_exception);
main();
