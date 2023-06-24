export const EOF = "";
export const REPLACEMENT = String.fromCharCode(0xFFFD);

export function is_ascii_lower(ch: string): boolean
{
    if (ch == EOF)
    {
        return false;
    }
    else
    {
        const code = ch.charCodeAt(0);
        return "a".charCodeAt(0) <= code && code <= "z".charCodeAt(0);
    }
}
export function is_ascii_upper(ch: string): boolean
{
    if (ch == EOF)
    {
        return false;
    }
    else
    {
        const code = ch.charCodeAt(0);
        return "A".charCodeAt(0) <= code && code <= "Z".charCodeAt(0);
    }
}
export function is_ascii_letter(ch: string): boolean
{
    return is_ascii_lower(ch) || is_ascii_upper(ch);
}
export function is_white_char(ch: string): boolean
{
    if (ch == EOF)
    {
        return false;
    }
    else
    {
        return [' ', '\t', '\n', '\f'].includes(ch);
    }
}
