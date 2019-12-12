import {t} from '../../locales';

export function validatePassword(pwd1 = '', pwd2 = '', currentLanguage) {
  if (pwd1 === pwd2) {
    if (pwd1.trim().length === 0) {
      return {
        ok: false,
        error: t('password.empty.error', currentLanguage, "Your password can't be empty"),
      };
    }
    if (pwd2.trim().length === 0) {
      return {
        ok: false,
        error: t('password.empty.error', currentLanguage, "Your password can't be empty"),
      };
    }
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/.test(pwd1)) {
      return { ok: true };
    } else {
      return {
        ok: false,
        error: t(
          'password.security.error',
          currentLanguage,
          'Your password should be longer than 8 characters and contains letters, capitalized letters, numbers and special characters (#$^+=!*()@%&) !'
        ),
      };
    }
  } else {
    return {
      ok: false,
      error: t('password.match.error', currentLanguage, 'Your passwords does not match !'),
    };
  }
}

export function validateUser(user, currentLanguage) {
  if(!user.password.trim()) {
    return {
      ok: false,
      error: t('password.empty.error', currentLanguage, "Your password can't be empty"),
    };
  } else if(!user.password.trim()) {
    return {
      ok: false,
      error: t('peronal.token.empty.error', currentLanguage, "Your personal token can't be empty"),
    };
  } else {
    return { ok: true };
  }
}