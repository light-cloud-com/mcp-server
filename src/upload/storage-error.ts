/**
 * Turn a failed signed-URL PUT into a message a human (or agent) can act
 * on. The bare status text ("Forbidden") sends people chasing plan
 * limits and permissions that have nothing to do with it. Storage's own
 * response body names internal buckets and service accounts, so it is
 * deliberately not echoed — only the status is mapped.
 */
export function describeStorageUploadFailure(response: { status: number; statusText: string }): string {
  switch (response.status) {
    case 401:
    case 403:
      return `Light Cloud storage refused the upload (${response.status}). This is a platform-side fault, not your account, plan or permissions — deploy from a git repository for now and report it to Light Cloud support.`;
    case 400:
      return 'the upload link was rejected, most likely expired — run the deploy again.';
    case 413:
      return 'the archive is too large for a single upload — exclude build output and large assets, or deploy from a git repository.';
    default:
      return `Light Cloud storage answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''} — try again in a moment.`;
  }
}
