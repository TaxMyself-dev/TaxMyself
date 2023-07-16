import "reflect-metadata";
import express from 'express';
import cors from 'cors';
import { expressjwt } from 'express-jwt';
import { datasource } from './datasource';
import bubuItemsRouter from './routes/bubuItemsRoute'
import usersRoute from './routes/usersRoute'
import authRoute from './routes/authRoute'
import expensesRoute from './routes/expensesRoute'
import incomesRoute from './routes/incomesRoute'


const app = express();
app.use(cors());
const jwtCheck = expressjwt({
  secret: '32r9oisdfaO(IJNWEHNasdfkas lkjasjhfe89ou:LKJD',
  algorithms: ['HS256']
}).unless({ path: ['/auth/login', '/auth/signup'] });
app.use(jwtCheck);
app.use(express.json());

app.use('/bubuItems', bubuItemsRouter);
app.use('/users', usersRoute);
app.use('/auth', authRoute);
app.use('/expenses', expensesRoute);
app.use('/incomes', incomesRoute);

datasource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!")
  })
  .catch((err) => {
    console.error("Error during Data Source initialization:", err)
  })

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));