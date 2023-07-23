export enum TOKEN_TYPE
{
    character = "ch", eof = "EOF", start_tag = "st", end_tag = "et", comment = "c", doctype = "dc"
}

export class TOKEN
{
    public readonly type: TOKEN_TYPE;
    private _content: string;
    public self_closing: boolean;

    public get content()
    {
        return this._content;
    }

    public readonly attributes: Record<string, string>;
    
    public constructor(type: TOKEN_TYPE, content = "")
    {
        this.type = type;
        this._content = content;
        this.self_closing = false;
        this.attributes = (type == TOKEN_TYPE.start_tag || type == TOKEN_TYPE.end_tag) ? {} : null;
    }

    public to_string(): string
    {
        return `<${this.type}> '${this._content}'`;
    }
    public add(c: string): void
    {
        this._content += c;
    }

    private new_attribute_name: string;
    private new_attribute_value: string;
    public new_attribute(name = "", value = "")
    {
        this.new_attribute_name = name;
        this.new_attribute_value = value;
    }
    public add_to_attribute_name(char: string)
    {
        this.new_attribute_name += char;
    } 
    public add_to_attribute_value(char: string)
    {
        this.new_attribute_value += char;
    }
    public set_attribute(emit_error: (message: string)=>void)
    {
        if (this.new_attribute_name != "")
        {
            if (this.attributes[this.new_attribute_name] == null)
            {
                this.attributes[this.new_attribute_name] = this.new_attribute_value;
                this.new_attribute_name = "";
                this.new_attribute_value = "";
            }
            else
            {
                emit_error("duplicate attributes");
            }
        }
    }
    public is(...name: string[])
    {
        return (this.type == TOKEN_TYPE.start_tag || this.type == TOKEN_TYPE.end_tag) && name.includes(this.content);
    }
}