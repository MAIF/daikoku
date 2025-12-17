export type IUser = {
  email: string
  name: string
  id?: string,
  password?: string
}
export const JIM: IUser = {
  email: "jim.halpert@dundermifflin.com",
  name: "Jim Halpert",
  id: "bd8ONIs7RKGjEjh5RUQP60KmKP1EjG9R"
};

export const PAM: IUser = {
  email: "pam.beesly@dundermifflin.com",
  name: "Pam Beesly"
};
export const DWIGHT: IUser = {
  email: "dwight.schrute@dundermifflin.com",
  name: "Dwight Schrute",
  id: "1AJMQB27BOOSQJC9xeUEwgDJNC5xuUq4"
};

export const MICHAEL: IUser = {
  email: "michael.scott@dundermifflin.com",
  name: "Michael Scott",
  id: "asFpYYNvJmQRVq3irA6p9cnILhTMLQMC"
};

export const ANDY: IUser = {
  email: "andy.bernard@dundermifflin.com",
  name: "Andy Bernard"
};

export const ROBERT: IUser = {
  email: "robert.california@dundermifflin.com",
  name: "Robert California",
  password: 'Pa$$w0rd'
};

