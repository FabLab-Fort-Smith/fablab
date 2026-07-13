// Domain object for a member mailbox mapping. Shapes the persisted document.
// NOTE: no password is ever stored — PurelyMail owns the mailbox credential.

/** @typedef {"active"|"suspended"|"revoked"} MailboxStatus */

export default class MemberMailbox {
  /**
   * @param {{ userID: string, localPart: string, address: string,
   *   status?: MailboxStatus, createdBy?: string|null }} args
   */
  constructor({ userID, localPart, address, status = "active", createdBy = null }) {
    const now = new Date().toISOString();
    this.userID = userID;
    this.localPart = localPart;
    this.address = address;
    this.status = status;
    this.createdBy = createdBy;
    this.createdAt = now;
    this.updatedAt = now;
  }
}
