I have a list of values in Python and I want to reverse
the order of its elements.

For example:

```python
numbers = [1, 2, 3, 4, 5]
```

I want to get:

```python
[5, 4, 3, 2, 1]
```

What is the recommended way to do this?

```python
# highlight testing
In: df = df.set_index("Name")
    dweights = {"RED": 3, "YELLOW": 2, "GREEN": 1, None: 0}
    # for name in df.index.unique().tolist():
    name = "A"
    dfdup = df.loc[name]
    if len(dfdup.index) > 1:
        dfweights = dfdup.copy()
        for i in range(len(dfdup.index)):
            for j in range(len(dfdup.columns)):
                dfweights.iloc[i,j] = dweights[dfdup.iloc[i,j]]
        mask = dfweights == dfweights.max()
        dfresult = dfdup.where(mask, "").max()

In: dfresults
Out:
Sample1  Yellow
Sample2  Yellow
Sample3     Red
```