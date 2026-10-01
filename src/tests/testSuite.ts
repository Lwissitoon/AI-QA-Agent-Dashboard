import { TestCase } from '../types/testCase';

export const testSuite: TestCase[] = [
  {
    id: 'TC-001',
    name: 'Positive LogIn test',
    description: 'Verify user can log in successfully with valid credentials',
    startUrl: 'https://practicetestautomation.com/practice-test-login/',
    goal: 'Type username "student" into Username field, type password "Password123" into Password field, click Submit, and finish.',
    maxSteps: 8,
    assertions: {
      expectedUrlContains: 'practicetestautomation.com/logged-in-successfully/',
      expectedTextVisible: ['Congratulations', 'successfully logged in'],
      expectedSelectorVisible: 'a.wp-block-button__link' // Botón Logout
    }
  },
  {
    id: 'TC-002',
    name: 'Negative username test',
    description: 'Verify error message appears when using incorrect username',
    startUrl: 'https://practicetestautomation.com/practice-test-login/',
    goal: 'Type username "incorrectUser" into Username field, type password "Password123" into Password field, click Submit, and finish when done.',
    maxSteps: 8,
    assertions: {
      expectedTextVisible: ['Your username is invalid!'],
      expectedSelectorVisible: '#error'
    }
  },
  {
    id: 'TC-003',
    name: 'Negative password test',
    description: 'Verify error message appears when using incorrect password',
    startUrl: 'https://practicetestautomation.com/practice-test-login/',
    goal: 'Type username "student" into Username field, type password "incorrectPassword" into Password field, click Submit, and finish when done.',
    maxSteps: 8,
    assertions: {
      expectedTextVisible: ['Your password is invalid!'],
      expectedSelectorVisible: '#error'
    }
  }
];