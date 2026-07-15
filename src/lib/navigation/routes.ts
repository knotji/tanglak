export function isRouteActive(pathname: string, href: string): boolean {
  // Strip query string and hash if present
  let cleanPathname = pathname.split("?")[0].split("#")[0];
  let cleanHref = href.split("?")[0].split("#")[0];

  // Strip trailing slashes unless it is exactly "/"
  if (cleanPathname !== "/" && cleanPathname.endsWith("/")) {
    cleanPathname = cleanPathname.slice(0, -1);
  }
  if (cleanHref !== "/" && cleanHref.endsWith("/")) {
    cleanHref = cleanHref.slice(0, -1);
  }

  if (cleanHref === "/") {
    return cleanPathname === "/";
  }

  return cleanPathname === cleanHref || cleanPathname.startsWith(`${cleanHref}/`);
}
