import * as fs from "node:fs";

import {TREE, NODE, ELEMENT, TEXT} from "./tree";

function get_title(head: NODE): {title_text: string, author: string}
{
    const title = {title_text: "empty", author: "unknown"};
    for (const ch of head.children)
    {
        if (ch instanceof ELEMENT)
        {
            if (ch instanceof ELEMENT && ch.name == "title")
            {
                title.title_text = (ch.children[0] as TEXT).text;
            }
            else if (ch instanceof ELEMENT && ch.name == "meta" && ch.attributes["name"] == "author")
            {
                title.author = ch.attributes["content"];
            }
        }
    }
    return title;
}

export function convert_to_LaTeX(t: TREE): void
{
    const file = fs.openSync("ex.tex", "w");
    const html = t.root.children[0];
    const title = get_title(html.children[0]);

    function write_line(line: string): void
    {
        fs.writeSync(file, line.replace(/\n|\r/g, " ") + "\n");
    }
    
    write_line("\\documentclass{article}");
    write_line(`\\title{${title.title_text}}`);
    write_line(`\\author{${title.author}}`);

    write_line("\\begin{document}");
    write_line("\\maketitle");
    
    let body: ELEMENT;
    for (const ch of html.children)
    {
        if (ch.content == "body")
        {
            body = ch as ELEMENT;
            break;
        }
    }

    for (const ch of body.children)
    {
        if (ch instanceof TEXT)
        {
            write_line(ch.text);
        }
        else
        {
            //
        }
    }

    write_line("\\end{document}");

    fs.closeSync(file);
}