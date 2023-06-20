export enum TOKEN_TYPE
{
    character = "ch", eof = "EOF", start_tag = "st", end_tag = "et", comment = "c"
}

export class TOKEN
{
    public readonly type: TOKEN_TYPE;
    private content: string;
    public self_closing: boolean;

    public readonly attributes: Record<string, string>;
    
    public constructor(type: TOKEN_TYPE, content = "")
    {
        this.type = type;
        this.content = content;
        this.self_closing = false;
        this.attributes = (type == TOKEN_TYPE.start_tag) ? {} : null;
    }

    public to_string(): string
    {
        return `<${this.type}> '${this.content}'`;
    }
    public add(c: string): void
    {
        this.content += c;
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
        if (this.attributes[this.new_attribute_name] == null)
        {
            this.attributes[this.new_attribute_name] = this.new_attribute_value;
        }
        else
        {
            emit_error("duplicate attributes");
        }
    }
}