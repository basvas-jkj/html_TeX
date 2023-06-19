import * as fs from "node:fs";

import {TOKEN} from "./token";
import {TOKENISER} from "./tokeniser"

function on_parse_error(message: string): void
{
    console.error(message);
}
function on_token(t: TOKEN)
{
    if (t.type != "ch")
        console.log(t.to_string());
}

function main(): void
{
    const source = fs.readFileSync("ex.html", "utf-8");
    const t = new TOKENISER(on_parse_error, on_token);
    t.tokenise(source);
}

process.on("uncaughtException", (e)=>
{
    console.error("Uncaught exception: " + e.message);
})

main();