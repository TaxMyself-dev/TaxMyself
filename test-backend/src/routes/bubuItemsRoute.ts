import { datasource } from '../datasource';
import { BubuItem } from '../entity/BubuItem';
import express, { Request, Response } from 'express';
const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
    const bubuItem = datasource.getRepository(BubuItem).create(req.body)
    const results = await datasource.getRepository(BubuItem).save(bubuItem)
    return res.send(results)
  });
  
  router.get('/', async (req: Request, res: Response) => {
    const bubuItems = await datasource.getRepository(BubuItem).find();
  
    res.status(200).json(bubuItems);
  });
  
  router.get('/:id', async (req: Request, res: Response) => {
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

export default router;