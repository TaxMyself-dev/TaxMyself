import "reflect-metadata";
import express, { Request, Response } from 'express';
import { datasource } from './datasource';
import { BubuItem } from './entity/BubuItem';

const app = express();
app.use(express.json());

datasource.initialize()
    .then(() => {
        console.log("Data Source has been initialized!")
    })
    .catch((err) => {
        console.error("Error during Data Source initialization:", err)
    })

  app.post('/bubuItem', async (req: Request, res: Response) => {
    const bubuItem = await datasource.getRepository(BubuItem).create(req.body)
    const results = await datasource.getRepository(BubuItem).save(bubuItem)
    return res.send(results)
  });

  app.get('/bubuItems', async (req: Request, res: Response) => {
    const bubuItems = await datasource.getRepository(BubuItem).find();

    res.status(200).json(bubuItems);
  });

  app.get('/bubuItem/:id', async (req: Request, res: Response) => {
    const wantedId = req.params.id;
    const bubuItem = await datasource.getRepository(BubuItem).findOne({
      where: {
          id: wantedId,
      }
  });

    if (!bubuItem) {
      res.status(404).send('BubuItem not found');
    } else {
      res.status(200).json(bubuItem);
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));