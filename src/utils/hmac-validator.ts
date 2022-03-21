import {Context} from '../context';
import {crypto} from '../adapters/abstract-http';
import {AuthQuery} from '../auth/oauth/types';
import * as ShopifyErrors from '../error';

import safeCompare from './safe-compare';

export function stringifyQuery(query: AuthQuery): string {
  const orderedObj = Object.fromEntries(
    Object.entries(query).sort((val1, val2) => val1[0].localeCompare(val2[0])),
  );
  return new URLSearchParams(orderedObj).toString();
}

export async function generateLocalHmac({
  code,
  timestamp,
  state,
  shop,
  host,
}: AuthQuery): Promise<string> {
  const queryString = stringifyQuery({
    code,
    timestamp,
    state,
    shop,
    ...(host && {host}),
  });
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(Context.API_SECRET_KEY),
    {
      name: 'HMAC',
      hash: {name: 'SHA-256'},
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(queryString),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Uses the received query to validate the contained hmac value against the rest of the query content.
 *
 * @param query HTTP Request Query, containing the information to be validated.
 */
export default async function validateHmac(query: AuthQuery): Promise<boolean> {
  if (!query.hmac) {
    throw new ShopifyErrors.InvalidHmacError(
      'Query does not contain an HMAC value.',
    );
  }
  const {hmac} = query;
  const localHmac = await generateLocalHmac(query);

  return safeCompare(hmac as string, localHmac);
}
