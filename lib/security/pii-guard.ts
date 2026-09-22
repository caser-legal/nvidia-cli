/**
 * PII Guard - Bidirectional PII handling
 * Redacts PII from input and can restore it in output
 */

export class PIIGuard {
  private patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    awsAccessKey: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
    awsSecretKey: /\b[A-Za-z0-9/+=]{40}\b/g,
    privateKey: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    apiKey: /\b(?:sk-[a-zA-Z0-9]{20,}|nvapi-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36})\b/g,
  };

  // Store mappings for restoration
  private mappings: Map<string, string> = new Map();
  private counter = 0;

  /**
   * Redact PII from text, storing mappings for later restoration
   */
  redact(text: string): string {
    let redacted = text;
    
    // Reset patterns (global regex state)
    for (const pattern of Object.values(this.patterns)) {
      pattern.lastIndex = 0;
    }
    
    redacted = this.redactPattern(redacted, this.patterns.email, "EMAIL");
    redacted = this.redactPattern(redacted, this.patterns.phone, "PHONE");
    redacted = this.redactPattern(redacted, this.patterns.ssn, "SSN");
    redacted = this.redactPattern(redacted, this.patterns.creditCard, "CREDIT_CARD");
    redacted = this.redactPattern(redacted, this.patterns.awsAccessKey, "AWS_KEY");
    redacted = this.redactPattern(redacted, this.patterns.awsSecretKey, "SECRET");
    redacted = this.redactPattern(redacted, this.patterns.privateKey, "PRIVATE_KEY");
    redacted = this.redactPattern(redacted, this.patterns.apiKey, "API_KEY");
    
    return redacted;
  }

  private redactPattern(text: string, pattern: RegExp, type: string): string {
    pattern.lastIndex = 0;
    return text.replace(pattern, (match) => {
      const placeholder = `[${type}_${++this.counter}]`;
      this.mappings.set(placeholder, match);
      return placeholder;
    });
  }

  /**
   * Restore PII in text using stored mappings
   */
  restore(text: string): string {
    let restored = text;
    for (const [placeholder, original] of this.mappings) {
      // Escape special regex characters in placeholder
      const escaped = placeholder.replace(/[[\]]/g, "\\$&");
      restored = restored.replace(new RegExp(escaped, "g"), original);
    }
    return restored;
  }

  /**
   * Check if text contains PII
   */
  containsPII(text: string): boolean {
    for (const pattern of Object.values(this.patterns)) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get count of redacted items
   */
  getRedactionCount(): number {
    return this.mappings.size;
  }

  /**
   * Clear mappings (for new conversation)
   */
  clear(): void {
    this.mappings.clear();
    this.counter = 0;
  }

  /**
   * Get redaction summary
   */
  getSummary(): { type: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const placeholder of this.mappings.keys()) {
      const match = placeholder.match(/\[([A-Z_]+)_\d+\]/);
      if (match) {
        const type = match[1];
        counts[type] = (counts[type] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }
}
