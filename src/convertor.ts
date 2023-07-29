import * as fs from "node:fs";

import {TREE, NODE, ELEMENT, TEXT} from "./tree";

let file: number;
function write(line: string)
{
    if (line[line.length - 1] == '\n')
    {
        fs.writeSync(file, line.trim().replace(/\s+/g, ' ').trim() + "\n");
    }
    else
    {
        fs.writeSync(file, line.trim().replace(/\s+/g, ' ').trim());
    }
}
function write_line(line = ""): void
{
    write(line + "\n");
}
function get_title(head: NODE): {title_text: string, author: string}
{
    const title = {title_text: "empty", author: "unknown"};
    for (const ch of head.children)
    {
        if (ch instanceof ELEMENT)
        {
            if (ch.name == "title")
            {
                title.title_text = (ch.children[0] as TEXT).text;
            }
            else if (ch.name == "meta" && ch.attributes["name"] == "author")
            {
                title.author = ch.attributes["content"];
            }
        }
    }
    return title;
}

const conversion_entries: Record<string, {before: string, after: string}> =
{
    "body": {before: "", after: ""},
    "h1": {before: "\\section*{", after: "}\n"},
    "h2": {before: "\\subsection*{", after: "}\n"},
    "h3": {before: "\\subsubsection*{", after: "}\n"},
    "h4": {before: "\\paragraph{", after: "}\n"},
    "h5": {before: "\\subparagraph{", after: "}\n"},
    "p": {before: "\n", after: "\n"},

    "b": {before: "\\textbf{", after: "}\n"},
    "strong": {before: "\\textbf{", after: "}\n"},
    "i": {before: "\\textit{", after: "}\n"},
    "em": {before: "\\emph{", after: "}\n"},
    "u": {before: "\\underline{", after: "}\n"},
    "big": {before: "{\\Large\n", after: "}\n"},
    "small": {before: "{\\small\n", after: "}\n"},
    "code": {before: "\\texttt{", after: "}\n"},
    "tt": {before: "\\texttt{", after: "}\n"},

    "br": {before: "\\\\", after: ""}
}


function convert(node: NODE)
{
    if (node instanceof TEXT)
    {
        write(node.text);
    }
    else if (node instanceof ELEMENT)
    {
        if (node.name == "img")
        {
            const attributes = node.attributes;
            if (attributes["src"] != null)
            {
                let options = "";
                if (attributes["height"] != null)
                {
                    options += ",height=" + attributes["height"]
                }
                if (attributes["width"] != null)
                {
                    options += ",width=" + attributes["width"]
                }
                if (options != "")
                {
                    options = "[" + options.substring(1) + "]"
                    write(`\\includegraphics${options}{${attributes["src"]}}`);
                }
                else
                {
                    write(`\\includegraphics{${attributes["src"]}}`);
                }
            }
        }
        else
        {
            write(conversion_entries[node.name].before);
            for (const ch of node.children)
            {
                convert(ch);
            }
            write(conversion_entries[node.name].after);
        }
    }
    else
    {
        write_line("% " + node.content);
    }
}

export function convert_to_LaTeX(t: TREE): void
{
    const html = t.root.children[0];
    let head: ELEMENT;
    let body: ELEMENT;

    for (const ch of html.children)
    {
        if (ch.content == "head")
        {
            head = ch as ELEMENT;
        }
        else if (ch.content == "body")
        {
            body = ch as ELEMENT;
        }
    }

    const title = get_title(head);

    file = fs.openSync("ex.tex", "w");

    write_line("\\documentclass{article}");
    write_line("\\usepackage{graphicx}")


    write_line(`\\title{${title.title_text}}`);
    write_line(`\\author{${title.author}}`);

    write_line("\\begin{document}");
    write_line("\\maketitle");
    write_line();
    
    convert(body);

    write_line("\\end{document}");

    fs.closeSync(file);
}