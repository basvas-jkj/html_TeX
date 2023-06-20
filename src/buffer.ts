import {EOF, CHAR} from "./char";

export class BUFFER
{
    private index = 0;
    private source: string
    public constructor(source: string)
    {
        this.source = source;
    }

    public read(): CHAR
    {
        const ch = (this.index < this.source.length) ? this.source[this.index] : EOF;
        this.index += 1;
        return ch;
    }
    public look(text: string, insensitive = false): boolean
    {
        let sub = this.source.substr(this.index, text.length);

        if (insensitive)
        {
            text = text.toLowerCase();
            sub = sub.toLowerCase();
        }

        if (text == sub)
        {
            this.index += text.length;
            return true;
        }
        else
        {
            return false;
        }
    }
    public send_back(): void
    {
        this.index -= 1;
    }
    public empty(): boolean
    {
        return (this.index > this.source.length);
    }
}