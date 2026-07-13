export class InvalidArgumentError extends Error {
  constructor(message = 'Invalid argument') {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}

export class DuplicateElementIdError extends Error {
  constructor(message = 'Element id already exists') {
    super(message);
    this.name = 'DuplicateElementIdError';
  }
}

export class InvalidSelectorError extends Error {
  constructor(message = 'A destructive operation requires an explicit selector') {
    super(message);
    this.name = 'InvalidSelectorError';
  }
}

export class ObjectDisposedError extends Error {
  constructor(message = 'The requested object has been disposed') {
    super(message);
    this.name = 'ObjectDisposedError';
  }
}

export class CapabilityError extends Error {
  constructor(message = 'The requested capability is unavailable') {
    super(message);
    this.name = 'CapabilityError';
  }
}

export class InteractionConflictError extends Error {
  constructor(message = 'The requested interaction conflicts with an active interaction') {
    super(message);
    this.name = 'InteractionConflictError';
  }
}

export class UnsupportedOperationError extends Error {
  constructor(message = 'The requested operation is unsupported') {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}
