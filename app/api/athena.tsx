// pages/api/athena.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Athena } from 'aws-sdk';

interface DataRow {
  [key: string]: string;
}

interface ApiResponse {
  data?: DataRow[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const athena = new Athena({
    region: 'us-east-1'
  });

  try {
    const params = {
      QueryString: 'SELECT * FROM project.gse LIMIT 10',
      QueryExecutionContext: {
        Database: 'project'
      },
      ResultConfiguration: {
        OutputLocation: 's3://YOUR_S3_BUCKET/athena-results/'
      }
    };

    const startQueryResponse = await athena.startQueryExecution(params).promise();
    const queryExecutionId = startQueryResponse.QueryExecutionId;

    let queryStatus;
    do {
      const queryExecution = await athena
        .getQueryExecution({ QueryExecutionId: queryExecutionId })
        .promise();
      queryStatus = queryExecution.QueryExecution.Status.State;
      if (queryStatus === 'FAILED' || queryStatus === 'CANCELLED') {
        throw new Error(`Query ${queryStatus}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED');

    const results = await athena
      .getQueryResults({ QueryExecutionId: queryExecutionId })
      .promise();

    const headers = results.ResultSet.ResultSetMetadata.ColumnInfo.map(
      column => column.Name
    );
    const rows = results.ResultSet.Rows.slice(1).map(row => {
      const rowData: DataRow = {};
      row.Data.forEach((cell, index) => {
        rowData[headers[index]] = cell.VarCharValue;
      });
      return rowData;
    });

    res.status(200).json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
}