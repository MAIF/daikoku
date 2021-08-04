describe('Login', () => {
  it('login', () => {
    cy
      .clearCookie('daikoku-session')
      .visit('http://localhost:9000/auth/Local/login')
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
      .get('main h1').should('have.text', 'Messages');
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
      .get('.avatar-with-action').should('have.length', 6)
      .visit('http://localhost:9000/settings/teams/consumers/members')
      .get('.avatar-with-action').should('have.length', 1)
      .visit('http://localhost:9000/settings/teams/consumers')
      .get('main h1').should('have.text', 'Team - Consumers');
  });
});

describe('tenants page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Tenants').click()
      .url().should('include', '/settings/tenants')
      .get('.avatar-with-action').should('have.length', 1)
      .visit('http://localhost:9000/settings/tenants/evil-corp')
      .get('main h1').should('have.text', 'Evil Corp.');
  });
});

describe('users page', () => {
  it('load well', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Users').click()
      .url().should('include', '/settings/users')
      .get('.avatar-with-action').should('have.length', 3)
      .visit('http://localhost:9000/settings/users/adminfoobar')
      .get('main h1').should('have.text', 'Admin - admin@foo.bar');
  });
});

describe('create new api version', () => {
  it('load well', () => {
    cy.visit('http://localhost:9000/')
      .get('.row:nth-child(2) h3').click()
      .get('.fa-edit').click({ force: true })
      .get('.reactSelect__value-container--has-value').click()
      .get('.css-1gtu0rj-indicatorContainer > .css-6q0nyr-Svg').click()
      .get('.btn-outline-info').click()
      .get('.form-control:nth-child(2)').click()
      .get('.form-control:nth-child(2)').type('4.0.0')
      .get('.modal-footer > .btn-outline-success').click()
      .get('.fa-save').click()
      .get('h1 > .btn').click()
      .get('.badge').first().should('have.text', '4.0.0')
  })
})