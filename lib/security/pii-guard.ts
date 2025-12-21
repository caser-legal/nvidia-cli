
export class PIIGuard {
  // Regex patterns for common PII
  private patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    apiKey: /sk-[a-zA-Z0-9]{20,}/g // Simple check for OpenAI/NVIDIA style keys
  };

  /**
   * Redact PII from text
   */
  redact(text: string): string {
    let redacted = text;
    
    redacted = redacted.replace(this.patterns.email, '[EMAIL_REDACTED]');
    redacted = redacted.replace(this.patterns.phone, '[PHONE_REDACTED]');
    redacted = redacted.replace(this.patterns.ipv4, '[IP_REDACTED]');
    redacted = redacted.replace(this.patterns.apiKey, '[API_KEY_REDACTED]');
    
    return redacted;
  }

  /**
   * Check if text contains PII
   */
  containsPII(text: string): boolean {
    return (
      this.patterns.email.test(text) ||
      this.patterns.phone.test(text) ||
      this.patterns.ipv4.test(text) ||
      this.patterns.apiKey.test(text)
    );
  }
}
