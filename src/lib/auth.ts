import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
} from "amazon-cognito-identity-js";

const userPool = new CognitoUserPool({
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

export function getCurrentUser(): CognitoUser | null {
  return userPool.getCurrentUser();
}

export function getSession(): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = getCurrentUser();
    if (!user) return reject(new Error("No user"));
    user.getSession(
      (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) return reject(err || new Error("No session"));
        resolve(session);
      },
    );
  });
}

export async function getIdToken(): Promise<string> {
  const session = await getSession();
  return session.getIdToken().getJwtToken();
}

export function signUp(
  email: string,
  password: string,
): Promise<CognitoUser> {
  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: "email", Value: email }),
    ];
    userPool.signUp(email, password, attrs, [], (err, result) => {
      if (err) return reject(err);
      resolve(result!.user);
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function signIn(
  email: string,
  password: string,
): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    user.authenticateUser(authDetails, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  const user = getCurrentUser();
  if (user) user.signOut();
}
