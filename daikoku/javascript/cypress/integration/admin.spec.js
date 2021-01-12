describe('Login', () => {
  it('login', () => {
    cy
      .clearCookie('daikoku-session')
      .visit('http://localhost:9000')
      .get('a.btn').contains('Connect').click()
      .get('input[name=username]').type('admin@foo.bar')
      .get('input[name=password]').type('password')
      .get('button').click()
      .url().should('include', '/apis');
  });
});

describe('Messages page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/apis')
      .get('.navbar a.messages-link').click()
      .url().should('include', '/settings/messages')
      .get('main h1').should('have.text', 'Messages')
  });
});

describe('Oto instances page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Otoroshi instances').click()
      .url().should('include', '/settings/otoroshis')
      .get('table tbody tr').should('have.length', 1)
      .get('table tbody tr .btn-outline-primary').click()
      .url().should('include', '/settings/otoroshis/default')
      .get('main form').should('be.visible');
  });
});

describe('Admins page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Admins').click()
      .url().should('include', '/settings/admins')
      .get('.avatar-with-action').should('have.length', 1);
  });
});

describe('Audit trail page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Audit trail').click()
      .url().should('include', '/settings/audit')
      .get('table').should('is.visible');
  });
});

describe('teams page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Teams').click()
      .url().should('include', '/settings/teams')
      .get('.avatar-with-action').should('have.length', 5); //todo: test edit && memebers
  });
});

describe('tenants page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Tenants').click()
      .url().should('include', '/settings/tenants')
      .get('.avatar-with-action').should('have.length', 1); //todo: test edit
  });
});

describe('users page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Users').click()
      .url().should('include', '/settings/users')
      .get('.avatar-with-action').should('have.length', 2); //todo: test edit
  });
});

