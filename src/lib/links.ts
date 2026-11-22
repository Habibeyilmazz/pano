/** The @handle for a person: the part of their email before the @. */
export const handleOf = (email: string) => email.split("@")[0].toLowerCase();

/** A same-site path. "//host" and "/\host" are other sites to a browser, so they do not count. */
export const isInternalHref = (href: string | undefined): href is string => !!href && /^\/(?![/\\])/.test(href);
