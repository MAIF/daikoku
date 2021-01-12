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

describe('Profile page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/settings/me')
      .get('main h1').should('have.text', 'Tester - tester@foo.bar')
  });
})

describe('Team apis page', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers')
      .get('h1.jumbotron-heading').should('have.text', 'Testers')
  });
})

describe('Team back-office', () => {
  it('load well', () => {
    cy
      .visit('http://localhost:9000/testers/settings')
      .get('main h1').should('have.text', 'Testers')
  });

  it('Team APIs works', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Team Apis').click()
      .url().should('include', '/testers/settings/apis')
      .get('table tbody tr').should('have.length', 1); //todo: test stats, subs, meta
  });

  it('Team income works', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Team Income').click()
      .url().should('include', '/testers/settings/income')
      .get('.col.apis').should('be.visible')
      .get('.api__billing__card').click()
      .get('.col.apikeys h3').should('have.text', 'test API');
  });

  it('Team billing works', () => {
    cy
      .get('nav#sidebar a.nav-link').contains('Team billing').click()
      .url().should('include', '/testers/settings/billing')
      .get('.api__billing__card__container').should('be.visible')
      .get('.api__billing__card__container .no-data').should('be.visible');
  });
})