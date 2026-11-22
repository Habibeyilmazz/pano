/** A same-site path. "//host" and "/\host" are other sites to a browser, so they do not count. */
export const isInternalHref = (href: string | undefined) => !!href && /^\/(?![/\\])/.test(href);
