describe('Login page & login form', () => {
  it('load well', () => {
    cy
      .clearCookie('daikoku-session')
      .visit('http://localhost:9000')
      .get('h1.jumbotron-heading').should('have.text', 'Evil Corp.')
  });

  it ('work', () => {
    cy.get('a.btn').contains('Connect').click()
      .get('input[name=username]').type('tester@foo.bar')
      .get('input[name=password]').type('password')
      .get('button').click()
      .url().should('include', '/apis');
  });
});

describe('API page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/test-api')
      .get('h1.jumbotron-heading').should('have.text', 'test API')
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
      .get('#swagger-ui').should('be.visible') ;
  });
});

describe('Notification page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/apis')
      .get('.navbar a.notification-link').click()
      .url().should('include', '/notifications')
      .get('main h1').should('have.text', 'Notifications (1)')
      .get(('div.alert.section')).should('have.length', 1);
  });
})