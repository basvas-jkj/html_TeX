export enum TOKEN_TYPE
{
    character = "ch", eof = "EOF", start_tag = "st", end_tag = "et", comment = "c"
}

export class TOKEN
{
    public readonly type: TOKEN_TYPE;
    private content: string;
    public self_closing: boolean;
    
    public constructor(type: TOKEN_TYPE, content = "")
    {
        this.type = type;
        this.content = content;
        this.self_closing = false;
    }

    public to_string(): string
    {
        return `<${this.type}> '${this.content}'`;
    }
    public add(c: string): void
    {
        this.content += c;
    }
}