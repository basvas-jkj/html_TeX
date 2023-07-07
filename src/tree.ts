import * as CHAR from "./char";

import {STATE, switch_state} from "./tokeniser";
import {TOKEN, TOKEN_TYPE} from "./token";

function is_white_char(ch: string): boolean
{
    return ch == '\r' || CHAR.is_white_char(ch);
}

enum MODE
{
    initial, before_html, before_head, in_head, after_head,
    in_body, after_body, after_after_body,
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

    public log(prefix = "")
    {
        console.log(prefix + this.content);
        for (const child of this.children)
        {
            child.log(prefix + "_");
        }
    }
}
class ELEMENT extends NODE
{
    get name(): string
    {
        return this.content;
    }

    public attributes: Record<string, string>;
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

    public override log(prefix = "")
    {
        console.log(prefix + " text" + '("' + this.text + '")');
    }
}

export class TREE
{
    private insertion_mode: MODE;
    private root: NODE;
    private quirk_mode = false;
    private stack_of_open_elements: ELEMENT[];
    private readonly mode_handlers: Record<MODE, (t: TOKEN)=>boolean>;
    private head: ELEMENT = null;
    private original_mode: MODE;
    private _ready: boolean;
    public get ready(): boolean
    {
        return this._ready;
    }

    private emit: (message: string)=> void;
    private parse_error()
    {
        this.emit(`parse error (${this.insertion_mode})`);
    }
    private stop_parsing()
    {
        this._ready = true;
        this.root.log();
    }

    public constructor(emit: (message: string)=> void)
    {
        this.emit = emit;
        this.insertion_mode = MODE.initial;
        this.root = new NODE();
        this.stack_of_open_elements = [];
        this._ready = false;

        this.mode_handlers =
        {
            [MODE.initial]: this.initial_mode.bind(this),
            [MODE.before_html]: this.before_html_mode.bind(this),
            [MODE.before_head]: this.before_head_mode.bind(this),
            [MODE.in_head]: this.in_head_mode.bind(this),
            [MODE.after_head]: this.after_head_mode.bind(this),
            [MODE.in_body]: this.in_body_mode.bind(this),
            [MODE.after_body]: this.after_body_mode.bind(this),
            [MODE.after_after_body]: this.after_after_body_mode.bind(this),
            [MODE.text]: this.text_mode.bind(this)
        }
    }

    private get last(): ELEMENT
    {
        return this.stack_of_open_elements[this.stack_of_open_elements.length - 1];
    }

    private insert_element(t: TOKEN | string): ELEMENT
    {
        const element = (typeof(t) == "string") ? new ELEMENT(t) : ELEMENT.from_token(t);
        this.last.add_child(element);
        this.stack_of_open_elements.push(element);
        return element;
    }
    private generic_rcdata(t: TOKEN): void
    {
        this.insert_element(t);
        switch_state(STATE.rcdata, t.content);
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
            const html = new ELEMENT("html");
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
            this.head = this.insert_element(t);
            this.insertion_mode = MODE.in_head;
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["head", "body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else if (!(t.type == TOKEN_TYPE.character && is_white_char(t.content)))
        {
            this.head = this.insert_element("head");
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
                case "meta":
                    this.insert_element(t);
                    this.stack_of_open_elements.pop();
                    break;
                case "title":
                    this.generic_rcdata(t);
                    break;

                case "noscript":
                case "noframes":
                case "style":
                case "script":
                case "template":
                case "base":
                case "basefont":
                case "bgsound":
                case "link":
                    throw new Error(`HTML tag ${t.content} is not supported.`);

                case "head":
                    this.parse_error();
                    break;
                default:
                    this.stack_of_open_elements.pop();
                    this.insertion_mode = MODE.after_head;
                    return true;
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag)
        {
            if (t.content == "head")
            {
                this.stack_of_open_elements.pop();
                this.insertion_mode = MODE.after_head;
            }
            else
            {
                this.parse_error();
            }
        }
        else
        {
            this.stack_of_open_elements.pop();
            this.insertion_mode = MODE.after_head;
            return true;
        }

        return false;
    }
    private after_head_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            (this.last as ELEMENT).insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(ELEMENT.from_token(t));
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
                    this.in_body_mode(t);
                    break;
                case "body":
                    this.insert_element(t);
                    this.insertion_mode = MODE.in_body;
                    break;
                case "frameset":
                case "base":
                case "basefont":
                case "bgsound":
                case "link":
                case "noframes":
                case "style":
                case "script":
                case "template":
                    throw new Error(`HTML tag ${t.content} is not supported.`);
                   
                case "title":
                case "meta":
                    this.parse_error();
                    this.stack_of_open_elements.push(this.head);
                    this.in_head_mode(t);
                    this.stack_of_open_elements.pop();
                    break;
                case "head":
                    this.parse_error();
                    break;
                default:
                    break;
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else
        {
            this.insert_element("body");
            this.insertion_mode = MODE.in_body;
            return true;
        }
        return false;
    }
    private in_body_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character)
        {
            if (t.content == '\0')
            {
                this.parse_error();
            }
            else
            {
                this.last.insert_char(t.content);
            }
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(ELEMENT.from_token(t));
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
                    this.parse_error();

                    for (const a in t.attributes)
                    {
                        this.last.attributes[a] ??= t.attributes[a];
                    }
                    break;
                case "base":
                case "basefont":
                case "bgsound":
                case "link":
                case "noframes":
                case "style":
                case "script":
                case "template":
                case "title":
                case "meta":
                    return this.in_head_mode(t);
                case "body":
                    this.parse_error();
                    if (this.stack_of_open_elements.length > 1 && this.stack_of_open_elements[1].name == "body")
                    {
                        for (const a in t.attributes)
                        {
                            this.last.attributes[a] ??= t.attributes[a];
                        }
                    }
                    break;
                default:
                    throw new Error(`HTML tag ${t.content} is not supported.`);
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag)
        {
            switch (t.content)
            {
                case "body":
                case "html":
                    this.insertion_mode = MODE.after_body;
                    //TODO /body /html
                    if (t.content == "html")
                    {
                        return true;
                    }
                    break;
                default:
                    throw new Error(`HTML tag ${t.content} is not supported.`);
            }
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            for (const e of this.stack_of_open_elements)
            {
                if (!["dd", "dt", "li", "optgroup", "option", "p", 
                      "rb", "rp", "rt", "rtc", "tbody", "td", "tfoot", 
                      "th", "thead", "tr", "body", "html"].includes(e.name))
                {
                    this.parse_error();
                    break;
                }
            }
            this.stop_parsing();
        }

        return false;
    }
    private text_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character)
        {
            this.last.insert_char(t.content);
        }
        else
        {
            if (t.type == TOKEN_TYPE.eof)
            {
                this.parse_error();
            }
            this.stack_of_open_elements.pop();
            this.insertion_mode = this.original_mode;
        }
        return false;
    }
    private after_body_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(ELEMENT.from_token(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.end_tag && t.content == "html")
        {
            this.insertion_mode = MODE.after_after_body;
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            this.stop_parsing();
        }
        else
        {
            this.parse_error();
            this.insertion_mode = MODE.in_body;
            return true;
        }
        return false;
    }
    private after_after_body_mode(t: TOKEN): boolean
    {
        
        if (t.type == TOKEN_TYPE.comment)
        {
            this.root.add_child(ELEMENT.from_token(t));
        }
        else if (t.type == TOKEN_TYPE.doctype || (t.type == TOKEN_TYPE.character && is_white_char(t.content)) || (t.type == TOKEN_TYPE.start_tag && t.content == "html"))
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            this.stop_parsing();
        }
        else
        {
            this.parse_error();
            this.insertion_mode = MODE.in_body;
            return true;
        }
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