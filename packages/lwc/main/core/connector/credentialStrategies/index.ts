import * as oauth from './oauth';
import { OAUTH_TYPES } from './oauthTypes';
import * as session from './session';
import * as usernamePassword from './usernamePassword';

export default {
    OAUTH: oauth,
    USERNAME: usernamePassword,
    SESSION: session,
};

export { OAUTH_TYPES };
