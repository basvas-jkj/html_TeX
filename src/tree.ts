import * as CHAR from "./char";

import {} from "./tokeniser";
import {TOKEN, TOKEN_TYPE} from "./token";

function is_white_char(ch: string): boolean
{
    return ch == '\r' || CHAR.is_white_char(ch);
}

enum MODE
{
    initial, before_html, before_head, in_head,
    text
}

class NODE
{
    protected children: NODE[];
    protected content: string;

    public constructor(content: string = null)
    {
        this.children = [];
        this.content = content;
    }

    public add_child(child: NODE)
    {
        this.children.push(child);
    }
}
class ELEMENT extends NODE
{
    private attributes: Record<string, string>;
    public static from_token(token: TOKEN): ELEMENT
    {
        const n = new ELEMENT(token.content);

        if (token.type == TOKEN_TYPE.start_tag)
        {
            n.attributes = token.attributes;
        }
        return n;
    }

    public insert_char(ch: string)
    {
        if (this.children.length > 0 && this.children[this.children.length-1] instanceof TEXT)
        {
            (this.children[this.children.length-1] as TEXT).add_text(ch);
        }
        else
        {
            this.add_child(new TEXT(ch));
        }
    }
}
class TEXT extends NODE
{
    private text: string;
    public add_text(text: string)
    {
        this.text += text;
    }
    public constructor(text: string)
    {
        super();
        this.content = "text";
        this.text = text;
    }
}

export class TREE
{
    private insertion_mode: MODE;
    private root: NODE;
    private quirk_mode = false;
    private stack_of_open_elements: NODE[];
    private readonly mode_handlers: Record<MODE, (t: TOKEN)=>boolean>;
    private head: ELEMENT = null;
    private original_mode: MODE;

    private emit: (message: string)=> void;
    private parse_error()
    {
        this.emit("parse error (tree construction phase)");
    }

    public constructor(emit: (message: string)=> void)
    {
        this.emit = emit;
        this.insertion_mode = MODE.initial;
        this.root = new NODE();
        this.stack_of_open_elements = [];

        this.mode_handlers =
        {
            [MODE.initial]: this.initial_mode.bind(this),
            [MODE.before_html]: this.before_html_mode.bind(this),
            [MODE.before_head]: this.before_head_mode.bind(this),
            [MODE.in_head]: this.in_head_mode.bind(this),
            [MODE.text]: this.text_mode.bind(this)
        }
    }

    private get last(): NODE
    {
        return this.stack_of_open_elements[this.stack_of_open_elements.length - 1];
    }

    private generic_rcdata(t: TOKEN): void
    {
        this.last.add_child(ELEMENT.from_token(t));
        this.original_mode = this.insertion_mode;
        this.insertion_mode = MODE.text;

    }

    private initial_mode(t: TOKEN): boolean
    {
        switch (t.type)
        {
            case TOKEN_TYPE.comment:
                this.root.add_child(ELEMENT.from_token(t));
                break;
            case TOKEN_TYPE.doctype:
                throw new Error("Under construction.");
            default:
                if (t.type != TOKEN_TYPE.character || !is_white_char(t.content))
                {
                    this.parse_error();
                    this.quirk_mode = true;
                    this.insertion_mode = MODE.before_html;
                    return true;
                }
        }
        return false;
    }
    private before_html_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.root.add_child(ELEMENT.from_token(t));
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            const html = ELEMENT.from_token(t);
            this.root.add_child(html);
            this.stack_of_open_elements.push(html);
            this.insertion_mode = MODE.before_head;
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["head", "body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else if (!(t.type == TOKEN_TYPE.character && is_white_char(t.content)))
        {
            const html = new NODE("html");
            this.root.add_child(html);
            this.stack_of_open_elements.push(html);
            this.insertion_mode = MODE.before_head;
            return true;
        }
        return false;
    }
    private before_head_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.comment)
        {
            this.root.add_child(ELEMENT.from_token(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "head")
        {
            this.head = ELEMENT.from_token(t);
            this.last.add_child(this.head);
            this.insertion_mode = MODE.in_head;
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["head", "body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else if (!(t.type == TOKEN_TYPE.character && is_white_char(t.content)))
        {
            this.head = new ELEMENT("head");
            this.last.add_child(this.head);
            this.insertion_mode = MODE.in_head;
            return true;
        }
        return false;
    }
    private in_head_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            this.head.insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.head.insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag)
        {
            switch (t.content)
            {
                case "html":
                    return this.in_body_mode(t);
                case "base":
                case "basefont":
                case "bgsound":
                case "link":
                case "meta":
                    this.head.add_child(ELEMENT.from_token(t));
                    break;
                case "title":
                    this.generic_rcdata(t);
                    break;

                //TODO noscript, noframes, style
                //TODO script, template


            }
        }

        return false;
    }

    private in_body_mode(t: TOKEN): boolean
    {
        return false;
    }

    public receive_token(t: TOKEN): void
    {
        let reprocess_token = false;
        do
        {
            reprocess_token = this.mode_handlers[this.insertion_mode](t);
        }
        while (reprocess_token);
    }
}