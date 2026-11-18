/** Errors the route layer turns into HTTP responses. */

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
