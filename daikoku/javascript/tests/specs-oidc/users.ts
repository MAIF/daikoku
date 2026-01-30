export type IUser = {
  email: string
  name: string
  id?: string
  password?: string
}

// OIDC users (matching docker-compose-openid.yml USERS_CONFIGURATION_INLINE)
export const MICHAEL: IUser = {
  email: "michael.scott@dundermifflin.com",
  name: "Michael Scott",
};

export const JIM: IUser = {
  email: "jim.halpert@dundermifflin.com",
  name: "Jim Halpert",
};

export const PAM: IUser = {
  email: "pam.beesly@dundermifflin.com",
  name: "Pam Beesly",
};

export const TOBY: IUser = {
  email: "toby.flenderson@dundermifflin.com",
  name: "Toby Flenderson",
};
