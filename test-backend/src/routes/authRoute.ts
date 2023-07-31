import { datasource } from '../datasource';
import express, { Request, Response } from 'express';
import { User } from '../entity/User';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/signup', async (req: Request, res: Response) => {
  try {
    console.log('\n\n\n\n\n\n\n\n\n\n\n\n')
    console.log(req.body)
    const existingUser = await datasource.getRepository(User).findOne({
      where: {
        email: req.body.email
      }
    });

    if (existingUser) {
      return res.status(409).send('User already exists');
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = datasource.getRepository(User).create({ ...req.body, password: hashedPassword });
    await datasource.getRepository(User).save(newUser);

    // create a copy of saved user, remove sensitive data before sending it back
    const returnUser = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
    };

    return res.status(201).json(returnUser);
  } catch (error) {
    console.error(error);
    return res.status(500).send('An unexpected error occurred during signup. Please try again.');
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const user = await datasource.getRepository(User).findOne({
    where: {
      email: req.body.email
    }
  });

  if (!user) {
    return res.status(404).send('User not found');
  }

  // compare the provided password with the stored hashed password
  const isMatch = await bcrypt.compare(req.body.password, user.password);

  if (!isMatch) {
    return res.status(401).send('Incorrect password');
  }

  const jwtSecret = '32r9oisdfaO(IJNWEHNasdfkas lkjasjhfe89ou:LKJD'
  // generate and sign a token
  const token = jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '5m' });

  return res.status(200).json({ token });
});

export default router;