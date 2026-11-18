/** Errors the route layer turns into HTTP responses. */

/** Nobody is signed in. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/** The thing does not exist, or it belongs to someone else (the two are never told apart). */
export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
    this.name = "NotFoundError";
  }
}

/** The request is well-formed but cannot be carried out as asked. */
export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

/** A topic has no passages left behind it (its file was removed), so nothing can be written for it. */
export class NoMaterialError extends InvalidRequestError {
  constructor(topicName: string) {
    super(
      `"${topicName}" has nothing from your materials behind it any more, so there is nothing to study it from. Add a file that covers it, merge it into another topic, or delete it.`,
    );
    this.name = "NoMaterialError";
  }
}

/** The server is missing something it needs to run at all (for example the database connection). */
export class SetupIncompleteError extends Error {
  constructor(public readonly missing: string) {
    super(`Setup incomplete: ${missing} is not configured`);
    this.name = "SetupIncompleteError";
  }
}
