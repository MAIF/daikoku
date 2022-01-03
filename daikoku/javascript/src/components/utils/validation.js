export function validatePassword(pwd1 = '', pwd2 = '', translateMethod) {
  if (pwd1 === pwd2) {
    if (pwd1.trim().length === 0) {
      return {
        ok: false,
        error: translateMethod('password.empty.error', false, "Your password can't be empty"),
      };
    }
    if (pwd2.trim().length === 0) {
      return {
        ok: false,
        error: translateMethod('password.empty.error', false, "Your password can't be empty"),
      };
    }
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/.test(pwd1)) {
      return { ok: true };
    } else {
      return {
        ok: false,
        error: translateMethod(
          'password.security.error',
          false,
          'Your password should be longer than 8 characters and contains letters, capitalized letters, numbers and special characters (#$^+=!*()@%&) !'
        ),
      };
    }
  } else {
    return {
      ok: false,
      error: translateMethod('password.match.error', false, 'Your passwords does not match !'),
    };
  }
}

export function validateUser(user, translateMethod) {
  if (!user.password.trim()) {
    return {
      ok: false,
      error: translateMethod('password.empty.error', false, "Your password can't be empty"),
    };
  } else if (!user.personalToken.trim()) {
    return {
      ok: false,
      error: translateMethod(
        'personal.token.empty.error',
        false,
        "Your personal token can't be empty"
      ),
    };
  } else {
    return ValidateEmail(user.email, translateMethod);
  }
}

export function ValidateEmail(email, translateMethod) {
  if (/^\w+(?:[.-]?\w+)*@\w+(?:[.-]?\w+)*(?:\.\w{2,3})+$/.test(email)) {
    return { ok: true };
  } else {
    return {
      ok: false,
      error: translateMethod(
        'email.validity.error',
        false,
        'You have entered an invalid email address'
      ),
    };
  }
}
