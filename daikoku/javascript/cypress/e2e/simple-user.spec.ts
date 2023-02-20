describe('API page', () => {
  it('load well', { scrollBehavior: false }, () => {
    //@ts-ignore
    cy.login('user@foo.bar', 'password')
      .visit('http://localhost:9000/testers/test-api/1.0.0/description')
      .get('h1.jumbotron-heading').should(($div) => {
        expect($div.text().trim()).contains('test API');
      })
      .wait(500)
      .get('.block__entry__link').contains('Plans').click()
      .get('.card').should('have.length', 1)
      .get('.block__entry__link').contains('Documentation').click()
      .get('.api-description #introduction').should('have.text', 'Introduction')
      .get('.block__entry__link').contains('Swagger').click()
      .get('#swagger-ui .swagger-ui').should('be.visible')
      // .get('#redoc-container h1').should(($title) => {
      //   const text = $title.text();
      //   expect(text).to.include('Swagger Petstore (1.0.0)');
      // })
      .get('.block__entry__link').contains('Testing').click()
      .get('#swagger-ui .swagger-ui').should('be.visible');
  });
});

describe('Profile page', () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('user@foo.bar', 'password')
      .visit('http://localhost:9000/me')
      .get('input[name="name"]').should('have.value', 'User');
  });
});

describe('Team apis page', () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('user@foo.bar', 'password')
      .visit('http://localhost:9000/testers')
      .get('h1.jumbotron-heading').should('have.text', 'Testers');
  });
})

describe('Select version of api', { scrollBehavior: false }, () => {
  it('load well', () => {
    //@ts-ignore
    cy.login('user@foo.bar', 'password')
      .visit('http://localhost:9000/testers/test-api/1.0.0/description')
      .get('input[name="versions-selector"]').should('have.value', '1.0.0')
      .get('.api__header .reactSelect__control')
      .click({ multiple: true })
      .get('.reactSelect__menu')
      .find('.reactSelect__option')
      .first()
      .click()
      .get('input[name="versions-selector"]').should('have.value', '2.0.0')
      .url().should('include', '2.0.0')
  });
})

// describe('Request api access from api view', () => {
//   it('load well', () => {
//     cy.visit('http://localhost:9000/')
//       // .visit('http://localhost:9000/apis')
//       // .get('.btn-outline-success').click({ force: true })
//       // .url().should('contains', 'http://localhost:9000/auth/Local/login')
//       // .get('form input[name="username"]').type('user@foo.bar')
//       // .get('form input[name="password"]').type('password')
//       // .get('.btn').click({ force: true })
//       // .get('.form-horizontal').submit()
//       // .url().should('contains', 'http://localhost:9000/')
//       .get('.row:nth-child(1) h3').click({ force: true })
//       .get('.btn-success').click({ force: true })
//       .visit("http://localhost:9000/logout")
//       // .get('.user-logo').click({ force: true })
//       // .get('.block__entry__link').contains('Logout').click({ force: true })
//       // .url().should('contains', 'http://localhost:9000/')
//       .visit('http://localhost:9000/auth/Local/login')
//       .get('form input[name="username"]').type('admin@foo.bar')
//       .get('form input[name="password"]').type('password')
//       .get('.btn').click({ force: true })
//       .get('.form-horizontal').submit()
//       .url().should('contains', 'http://localhost:9000/apis')
//       .get('.fa-bell').click({ force: true })
//       .get('div:nth-child(2) > .alert .btn:nth-child(1)').click({ force: true })
//       .get('.nav:nth-child(5) > .nav-item:nth-child(2) > .nav-link').click({ force: true })
//       .get('.avatar-with-action:nth-child(3) a').click({ force: true })
//       .url().should('contains', 'http://localhost:9000/')
//       .get('.row:nth-child(1) h3').click({ force: true })
//   });
// });