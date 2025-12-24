
export class PIIGuard {
  // Regex patterns for common PII and secrets
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

  /**
   * Redact PII from text
   */
  redact(text: string): string {
    let redacted = text;
    
    redacted = redacted.replace(this.patterns.email, '[EMAIL_REDACTED]');
    redacted = redacted.replace(this.patterns.phone, '[PHONE_REDACTED]');
    redacted = redacted.replace(this.patterns.ssn, '[SSN_REDACTED]');
    redacted = redacted.replace(this.patterns.creditCard, '[CREDIT_CARD_REDACTED]');
    redacted = redacted.replace(this.patterns.awsAccessKey, '[AWS_KEY_REDACTED]');
    redacted = redacted.replace(this.patterns.awsSecretKey, '[SECRET_REDACTED]');
    redacted = redacted.replace(this.patterns.privateKey, '[PRIVATE_KEY_REDACTED]');
    redacted = redacted.replace(this.patterns.apiKey, '[API_KEY_REDACTED]');
    
    return redacted;
  }

  /**
   * Check if text contains PII
   */
  containsPII(text: string): boolean {
    // Reset lastIndex to avoid global regex state bug
    for (const pattern of Object.values(this.patterns)) {
      pattern.lastIndex = 0;
    }
    return Object.values(this.patterns).some(p => {
      p.lastIndex = 0;
      return p.test(text);
    });
  }
}
