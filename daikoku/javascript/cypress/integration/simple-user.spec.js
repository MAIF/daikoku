describe('Login page & login form', () => {
  it('load well', () => {
    cy
      .clearCookie('daikoku-session')
      .visit('http://localhost:9000/auth/Local/login')
      .get('input[name=username]').type('user@foo.bar')
      .get('input[name=password]').type('password')
      .get('button').click()
      .url().should('include', '/apis');
  });
});

describe('API page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/test-api/1.0.0')
      .get('h1.jumbotron-heading').should(($div) => {
        expect($div.text().trim()).contains('test API');
      })
      .get('a.nav-link').contains('Plans').click()
      .get('.card').should('have.length', 2)
      .get('a.nav-link').contains('Documentation').click()
      .get('.api-description #introduction').should('have.text', 'Introduction')
      .get('a.nav-link').contains('Api Reference').click()
      .get('#redoc-container h1').should(($title) => {
        const text = $title.text();
        expect(text).to.include('Swagger Petstore (1.0.0)');
      })
      .get('a.nav-link').contains('Try it !').click()
      .get('#swagger-ui').should('be.visible');
  });
});

describe('Profile page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/settings/me')
      .get('#my_profile_email').should('have.text', 'user@foo.bar');
  });
});

describe('Team apis page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers')
      .get('h1.jumbotron-heading').should('have.text', 'Testers');
  });
})

describe('Select version of api', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/test-api/1.0.0')
      .get('input[name="versions-selector"]').should('have.value', '1.0.0')
      .get('.reactSelect__control')
      .click({ multiple: true })
      .get('.reactSelect__menu')
      .find('.reactSelect__option')
      .first()
      .click()
      .get('input[name="versions-selector"]').should('have.value', '2.0.0')
      .url().should('include', '2.0.0')
  });
})

describe('Request api access from api view', () => {
  it('load well', () => {
    cy.visit('http://localhost:9000/logout')
      .visit('http://localhost:9000/apis')
      .get('.btn-outline-success').click()
      .url().should('contains', 'http://localhost:9000/auth/Local/login')
      .get('.form-group:nth-child(2) > .form-control').click()
      .get('.form-group:nth-child(2) > .form-control').type('user@foo.bar')
      .get('.form-group:nth-child(3) > .form-control').type('password')
      .get('.btn').click()
      .get('.form-horizontal').submit()
      .url().should('contains', 'http://localhost:9000/')
      .get('.row:nth-child(1) h3').click()
      .get('.dropdown-toggle').click()
      .get('.fa-sign-out-alt').parent().click()
      .url().should('contains', 'http://localhost:9000/')
      .get('.btn-outline-success').click()
      .url().should('contains', 'http://localhost:9000/auth/Local/login')
      .get('.form-group:nth-child(2) > .form-control').click()
      .get('.form-group:nth-child(2) > .form-control').type('admin@foo.bar')
      .get('.form-group:nth-child(3) > .form-control').click()
      .get('.form-group:nth-child(3) > .form-control').type('password')
      .get('.btn').click()
      .get('.form-horizontal').submit()
      .url().should('contains', 'http://localhost:9000/apis')
      .get('.fa-bell').click()
      .get('div:nth-child(2) > .alert .btn:nth-child(1)').click()
      .get('.nav:nth-child(5) > .nav-item:nth-child(2) > .nav-link').click()
      .get('.avatar-with-action:nth-child(3) a').click({ force: true })
      .url().should('contains', 'http://localhost:9000/')
      .get('.row:nth-child(1) h3').click()
  });
});