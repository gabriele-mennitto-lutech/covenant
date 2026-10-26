export type WindowsFamily = 'Windows' | 'Windows Server' | 'Other';

export function windowsFamily(os: unknown): WindowsFamily {
    const value = String(os || '').trim();
    if (/^(?:microsoft\s+)?windows\s+server\b/i.test(value)) return 'Windows Server';
    if (/^(?:microsoft\s+)?windows(?:\s|$)/i.test(value)) return 'Windows';
    return 'Other';
}
