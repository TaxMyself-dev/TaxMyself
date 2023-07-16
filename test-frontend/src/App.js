import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const shortNotificTime = 2000
const longNotificTime = 5000
const apiUrl = 'http://localhost:3000'

const Home = () => (
  <div>
    <h2>Welcome to our Self-Taxing System</h2>
    <p>This system will revolutionize the way you manage your taxes...</p>
  </div>
);

const About = () => (
  <div>
    <h2>About Our Self-Taxing System</h2>
    <p>Why spend extra on an accountant when our system provides... </p>
  </div>
);

const MyAccount = () => {
  const [userName, setUserName] = useState('');
  const [expensesData, setExpensesData] = useState([])
  const [incomesData, setIncomesData] = useState([])
  const jwtToken = localStorage.getItem('token');

  useEffect(() => {
    if (jwtToken) {
      GetUserData();
    }
  }, [jwtToken]); // Run the effect when `jwtToken` changes

  const GetUserData = async () => {
    const response = await fetch(`${apiUrl}/users/userdata`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    })
    if (response.ok) {
      const data = await response.json();
      console.log(data)
      setUserName(`${data.firstName} ${data.lastName}`)
      setExpensesData(data.expenses)
      setIncomesData(data.incomes)
    } else {
      localStorage.removeItem('token')
      return <Navigate to="/login" />
    }
  }

  if (!jwtToken) {
    return <Navigate to="/login" />
  }

  

  return (
    <div>
      <h2>Welcome, {userName}</h2>
      <nav className='simple-navbar'>
        <Link className='nav-element' to="/myaccount/expenses">Expenses</Link>
        <Link className='nav-element' to="/myaccount/incomes">Incomes</Link>
      </nav>
      <Routes>
        <Route path="/expenses" element={<Expenses expensesArr={expensesData}/>} />
        <Route path="/incomes" element={<Incomes incomesArr={incomesData}/>} />
      </Routes>
    </div>
  );
};

const Expenses = ({ expensesArr }) => {
  const [amount, setAmount] = useState('777');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [invoiceId, setInvoiceId] = useState('777h');
  const [type, setType] = useState('Consumable goods');
  const [expenseNotif, setExpenseNotif] = useState('');
  const jwtToken = localStorage.getItem('token');

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();

    const dateStr = date.toISOString().split('T')[0]
    if (amount.trim() == '' || dateStr == '' || category.trim() == '' || invoiceId.trim() == '' || type.trim() == '') {
      setExpenseNotif('Please fill in all the fields')
      setTimeout(() => {
        setExpenseNotif('')
      }, shortNotificTime);
      return
    }
    console.log(dateStr)
    const response = await fetch(`${apiUrl}/expenses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount.trim(),
        date: dateStr,
        category: category.trim(),
        type: type.trim(),
        invoiceId: invoiceId.trim()
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(data)
      window.location.reload()
    } else {
      localStorage.removeItem('token')
      return <Navigate to="/login" />
    }
  }
  if (!jwtToken) {
    return <Navigate to="/login" />
  }
  return (
    <div>
      <h1>Expenses</h1>
      <h3>Add a new expense</h3>
      {expenseNotif != '' ? <label className='error-label'> {expenseNotif} </label> : null}
      <form className='form-grid' onSubmit={handleExpenseSubmit}>
        <label> Amount: </label>
        <input type="number" onChange={(e) => setAmount(e.target.value)} />
        <label> Date: </label>
        <DatePicker selected={date} onChange={(date) => setDate(date)} />
        <label> Category: </label>
        <select onChange={(e) => setCategory(e.target.value)}>
          <option value="Electronics">Electronics</option>
          <option value="Office stuff">Office stuff</option>
          <option value="Transportation">Transportation</option>
          <option value="Goods">Goods</option>
        </select>
        <label> Invoice ID: </label>
        <input type="text" onChange={(e) => setInvoiceId(e.target.value)} />
        <label> Type: </label>
        <select onChange={(e) => setType(e.target.value)}>
          <option value="Consumable goods">Consumable goods</option>
          <option value="Durable goods">Durable goods</option>
        </select>
        <input type="submit" value="Log expense" />
      </form>

      <h3>Existing expenses</h3>
      <table>
      <thead>
        <tr>
          <th>Amount</th>
          <th>Date</th>
          <th>Category</th>
          <th>Invoice ID</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {expensesArr.map((item, index) => (
          <tr key={index}>
            <td>{item.amount}</td>
            <td>{new Date(item.date).toLocaleDateString()}</td>
            <td>{item.category}</td>
            <td>{item.invoiceId}</td>
            <td>{item.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
};

const Incomes = ({ incomesArr }) => {
  const [amount, setAmount] = useState('777');
  const [date, setDate] = useState('');
  const [receiptId, setReceiptId] = useState('777h');
  const [incomeNotif, setIncomeNotif] = useState('');
  const jwtToken = localStorage.getItem('token');

  const handleIncomeSubmit = async (event) => {
    event.preventDefault();

    const dateStr = date.toISOString().split('T')[0]
    if (amount.trim() == '' || dateStr == '' || receiptId.trim() == '') {
      setIncomeNotif('Please fill in all the fields')
      setTimeout(() => {
        setIncomeNotif('')
      }, shortNotificTime);
      return
    }
    console.log(dateStr)
    const response = await fetch(`${apiUrl}/incomes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount.trim(),
        date: dateStr,
        receiptId: receiptId.trim()
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(data)
      window.location.reload()
    } else {
      localStorage.removeItem('token')
      return <Navigate to="/login" />
    }
  }
  if (!jwtToken) {
    return <Navigate to="/login" />
  }
  return (
    <div>
      <h1>Incomes</h1>
      <h3>Add a new income</h3>
      {incomeNotif != '' ? <label className='error-label'> {incomeNotif} </label> : null}
      <form className='form-grid' onSubmit={handleIncomeSubmit}>
        <label> Amount: </label>
        <input type="number" onChange={(e) => setAmount(e.target.value)} />
        <label> Date: </label>
        <DatePicker selected={date} onChange={(date) => setDate(date)} />
        <label> Receipt ID: </label>
        <input type="text" onChange={(e) => setReceiptId(e.target.value)} />
        <input type="submit" value="Log income" />
      </form>

      <h3>Existing incomes</h3>
      <table>
      <thead>
        <tr>
          <th>Amount</th>
          <th>Date</th>
          <th>Receipt ID</th>
        </tr>
      </thead>
      <tbody>
        {incomesArr.map((item, index) => (
          <tr key={index}>
            <td>{item.amount}</td>
            <td>{new Date(item.date).toLocaleDateString()}</td>
            <td>{item.receiptId}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (email.trim() == '' || password == '') {
      setLoginError('Please fill in all the fields')
      setTimeout(() => {
        setLoginError('')
      }, shortNotificTime);
      return
    }

    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password,
          email
        })
      })

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        console.log('logged in')
        navigate('/myaccount', { replace: true })
      } else {
        setLoginError('Wrong email or password, please try again')
        setTimeout(() => {
          setLoginError('')
        }, shortNotificTime);
      }
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div>
      <h2>Login</h2>
      {loginError != '' ? <label className='error-label'> {loginError} </label> : null}
      <form className='form-grid' onSubmit={handleSubmit}>
        <label> Email: </label>
        <input type="email" name="email" onChange={(e) => setEmail(e.target.value)} />
        <label> Password: </label>
        <input type="password" name="password" onChange={(e) => setPassword(e.target.value)} />
        <input type="submit" value="Log in" />
      </form>
      <Link to="/signup">Don't have an account? Sign Up</Link>
    </div>
  )
}

const SignUp = () => {
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const navigate = useNavigate();

  const handleSignupSubmit = async (event) => {
    event.preventDefault();

    if (firstname.trim() == '' || lastname.trim() == '' || email.trim() == '' || password == '') {
      setSignupError('Please fill in all the fields')
      setTimeout(() => {
        setSignupError('')
      }, shortNotificTime);
      return
    }
    const response = await fetch('http://localhost:3000/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        firstName: firstname.trim(),
        lastName: lastname.trim(),
        email: email.trim(),
        password: password,
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(data)
      navigate('/login', { replace: true });
    } else {
      setSignupError('This email is already used in the system. Please log in or use another email')
      setTimeout(() => {
        setSignupError('')
      }, longNotificTime);
    }
  }

  return (
    <div>
      <h2>Sign Up</h2>
      {signupError != '' ? <label className='error-label'> {signupError} </label> : null}
      <form className='form-grid' onSubmit={handleSignupSubmit}>
        <label> First name: </label>
        <input type="text" name="firstname" onChange={(e) => setFirstname(e.target.value)} />
        <label> Last name: </label>
        <input type="text" name="lastname" onChange={(e) => setLastname(e.target.value)} />
        <label> Email: </label>
        <input type="email" name="email" onChange={(e) => setEmail(e.target.value)} />
        <label> Password: </label>
        <input type="password" name="password" onChange={(e) => setPassword(e.target.value)} />
        <input type="submit" value="Sign up" />
      </form>
      <Link to="/login">Already have an account? Log in</Link>
    </div>
  );
}

const App = () => (
  <Router>
    <nav className='top-nav'>
      <Link className='nav-element' to="/">Home</Link>
      <Link className='nav-element' to="/myaccount">My Account</Link>
      <Link className='nav-element' to="/about">About</Link>
    </nav>

    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/myaccount/*" element={<MyAccount />} />
      <Route path="/about" element={<About />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
    </Routes>
  </Router>
);

export default App;