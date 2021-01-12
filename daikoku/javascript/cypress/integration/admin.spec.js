describe('Login', () => {
  it ('login', () => {
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
  it('Team income works', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Otoroshi instances').click()
      .url().should('include', '/settings/otoroshis')
      .get('table tbody tr').should('have.length', 1)
      .get('table tbody tr .btn-outline-primary').click()
      .url().should('include', '/settings/otoroshis/default')
      .get('main form').should('be.visible');
  });
});

