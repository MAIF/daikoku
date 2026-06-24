export type IUser = {
  email: string
  name: string
  id?: string,
  password?: string
}

// Team admin (of "API Division") used to send the invitation.
// Seeded as LDAP origin in the state; the spec patches a local password at runtime.
export const MICHAEL: IUser = {
  email: "michael.scott@dundermifflin.com",
  name: "Michael Scott",
  id: "asFpYYNvJmQRVq3irA6p9cnILhTMLQMC"
};

// Unknown-of-Daikoku user, invited by mail (receives a token link, then signs up).
export const ROBERT: IUser = {
  email: "robert.california@dundermifflin.com",
  name: "Robert California",
  password: 'Pa$$w0rd'
};
